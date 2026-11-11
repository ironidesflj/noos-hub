/**
 * Cliente mínimo da API do GitHub (GraphQL + REST) para a Camada de Mielina.
 *
 * - Token nunca aparece em mensagem de erro, URL ou log.
 * - Erros do GitHub viram `GitHubError` com status e mensagem segura.
 * - Leituras de arquivos de `main` usam Git Trees + Blobs (sem o limite de 1 MB
 *   da Contents API), para snapshots de discussão que crescem com o tempo.
 * - Commit de curadoria usa `createCommitOnBranch` com `expectedHeadOid`
 *   (concorrência otimista + commit criado/assinado pela GitHub).
 */

const API_BASE = "https://api.github.com";
const GRAPHQL_URL = "https://api.github.com/graphql";
const USER_AGENT = "noos-mielina-api";

export class GitHubError extends Error {
  constructor(message, options = {}) {
    super(String(message || "Falha na API do GitHub").slice(0, 400));
    this.name = "GitHubError";
    this.status = Number(options.status) || 502;
    this.code = options.code || "GITHUB_ERROR";
  }
}

const VIEWER_QUERY = `query { viewer { id login } }`;

const REPOSITORY_QUERY = `
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    id
    nameWithOwner
  }
}`;

const DISCUSSIONS_QUERY = `
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    discussions(first: 100, after: $cursor, orderBy: {field: CREATED_AT, direction: ASC}) {
      pageInfo { hasNextPage endCursor }
      nodes { id number url title createdAt }
    }
  }
}`;

const CREATE_DISCUSSION_MUTATION = `
mutation($input: CreateDiscussionInput!) {
  createDiscussion(input: $input) {
    discussion { id number url title }
  }
}`;

const ADD_COMMENT_MUTATION = `
mutation($input: AddDiscussionCommentInput!) {
  addDiscussionComment(input: $input) {
    comment { id url createdAt author { id login } }
  }
}`;

const NODE_QUERY = `
query($id: ID!) {
  node(id: $id) {
    __typename
    ... on Discussion {
      id
      title
      url
      body
      author { id login }
    }
    ... on DiscussionComment {
      id
      url
      body
      createdAt
      author { id login }
      discussion {
        id
        number
        url
        title
        repository { nameWithOwner }
      }
    }
  }
}`;

const REACTIONS_QUERY = `
query($id: ID!, $cursor: String) {
  node(id: $id) {
    __typename
    ... on Discussion {
      reactions(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes { content user { id login __typename } }
      }
    }
    ... on DiscussionComment {
      reactions(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes { content user { id login __typename } }
      }
    }
  }
}`;

const ADD_REACTION_MUTATION = `
mutation($subjectId: ID!, $content: ReactionContent!) {
  addReaction(input: {subjectId: $subjectId, content: $content}) {
    reaction { content }
  }
}`;

const REMOVE_REACTION_MUTATION = `
mutation($subjectId: ID!, $content: ReactionContent!) {
  removeReaction(input: {subjectId: $subjectId, content: $content}) {
    reaction { content }
  }
}`;

const CREATE_COMMIT_MUTATION = `
mutation($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) {
    commit { oid url }
  }
}`;

const MAX_PAGES = 100;

function normalizeUser(user) {
  if (!user || !user.id) return { authorId: "", handle: "" };
  return {
    authorId: String(user.id),
    handle: user.login ? `@${user.login}` : "",
  };
}

export class GitHubClient {
  constructor(options = {}) {
    const repo = String(options.repo || "").trim();
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
      throw new GitHubError("MIELINA_REPO inválido (esperado owner/name).", {
        status: 503,
        code: "ENV_INVALID",
      });
    }
    const [owner, name] = repo.split("/");
    this.repo = repo;
    this.owner = owner;
    this.name = name;
    this.token = String(options.token || "");
    this.fetchImpl = options.fetchImpl || ((...args) => globalThis.fetch(...args));
    this.apiBase = options.apiBase || API_BASE;
    this.graphqlUrl = options.graphqlUrl || GRAPHQL_URL;
  }

  _headers(extra = {}) {
    const headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": USER_AGENT,
      "X-GitHub-Api-Version": "2022-11-28",
      ...extra,
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    return headers;
  }

  async graphql(query, variables = {}) {
    if (!this.token) {
      throw new GitHubError("Token do GitHub ausente no servidor.", {
        status: 503,
        code: "ENV_MISSING",
      });
    }
    let response;
    try {
      response = await this.fetchImpl(this.graphqlUrl, {
        method: "POST",
        headers: this._headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ query, variables }),
      });
    } catch (error) {
      throw new GitHubError(`Falha de rede ao falar com o GitHub: ${error && error.message}`, {
        status: 502,
        code: "GITHUB_NETWORK",
      });
    }
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const message = payload && payload.message ? payload.message : `HTTP ${response.status}`;
      throw new GitHubError(`GitHub GraphQL: ${message}`, {
        status: response.status >= 500 ? 502 : response.status,
        code: "GITHUB_GRAPHQL",
      });
    }
    if (payload && Array.isArray(payload.errors) && payload.errors.length) {
      const first = payload.errors[0] || {};
      throw new GitHubError(`GitHub GraphQL: ${first.message || "erro desconhecido"}`, {
        status: first.type === "NOT_FOUND" ? 404 : 502,
        code: "GITHUB_GRAPHQL",
      });
    }
    return (payload && payload.data) || {};
  }

  async rest(pathname, options = {}) {
    if (!this.token) {
      throw new GitHubError("Token do GitHub ausente no servidor.", {
        status: 503,
        code: "ENV_MISSING",
      });
    }
    const url = pathname.startsWith("http") ? pathname : `${this.apiBase}${pathname}`;
    const method = options.method || "GET";
    let response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: this._headers({
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.accept ? { Accept: options.accept } : {}),
        }),
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (error) {
      throw new GitHubError(`Falha de rede ao falar com o GitHub: ${error && error.message}`, {
        status: 502,
        code: "GITHUB_NETWORK",
      });
    }
    if (response.status === 204) return { status: 204, data: null };
    let data = null;
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    if (!response.ok) {
      const message = data && data.message ? String(data.message) : `HTTP ${response.status}`;
      throw new GitHubError(`GitHub REST: ${message}`, {
        status: response.status >= 500 ? 502 : response.status,
        code: "GITHUB_REST",
      });
    }
    return { status: response.status, data };
  }

  /* --------------------------------------------------------------- leitura */

  async getViewer() {
    const data = await this.graphql(VIEWER_QUERY);
    const viewer = data.viewer;
    if (!viewer || !viewer.id) {
      throw new GitHubError("Não foi possível confirmar a identidade no GitHub.", {
        status: 401,
        code: "VIEWER_UNKNOWN",
      });
    }
    return { authorId: String(viewer.id), handle: viewer.login ? `@${viewer.login}` : "" };
  }

  async getRepository() {
    const data = await this.graphql(REPOSITORY_QUERY, { owner: this.owner, name: this.name });
    if (!data.repository || !data.repository.id) {
      throw new GitHubError("Repositório não encontrado no GitHub.", {
        status: 404,
        code: "REPO_NOT_FOUND",
      });
    }
    return { id: String(data.repository.id), nameWithOwner: String(data.repository.nameWithOwner) };
  }

  async listDiscussions() {
    const discussions = [];
    let cursor = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const data = await this.graphql(DISCUSSIONS_QUERY, {
        owner: this.owner,
        name: this.name,
        cursor,
      });
      const connection = data.repository && data.repository.discussions;
      if (!connection) break;
      for (const node of connection.nodes || []) {
        if (node) discussions.push(node);
      }
      if (!connection.pageInfo || !connection.pageInfo.hasNextPage) break;
      cursor = connection.pageInfo.endCursor;
    }
    return discussions;
  }

  /** A discussion canônica é a mais antiga com o título exato (ID público). */
  async findDiscussionByTitle(title) {
    const wanted = String(title || "").trim();
    if (!wanted) return null;
    const discussions = await this.listDiscussions();
    return discussions.find((discussion) => String(discussion.title) === wanted) || null;
  }

  /**
   * Garante a discussion canônica da questão. A criação é "serializada" de
   * forma oportunista: se outra instância criou antes, relê e reaproveita.
   */
  async ensureDiscussion(input) {
    const title = String(input.title || "").trim();
    const existing = await this.findDiscussionByTitle(title);
    if (existing) return { discussion: existing, created: false };
    let created;
    try {
      created = await this.createDiscussion({
        repositoryId: input.repositoryId,
        categoryId: input.categoryId,
        title,
        body: input.body,
      });
    } catch (error) {
      const retry = await this.findDiscussionByTitle(title).catch(() => null);
      if (retry) return { discussion: retry, created: false };
      throw error;
    }
    return { discussion: created, created: true };
  }

  async createDiscussion(input) {
    const data = await this.graphql(CREATE_DISCUSSION_MUTATION, {
      input: {
        repositoryId: input.repositoryId,
        categoryId: input.categoryId,
        title: input.title,
        body: input.body,
      },
    });
    const discussion = data.createDiscussion && data.createDiscussion.discussion;
    if (!discussion || !discussion.id) {
      throw new GitHubError("GitHub não devolveu a discussion criada.", {
        status: 502,
        code: "DISCUSSION_CREATE_FAILED",
      });
    }
    return discussion;
  }

  async addDiscussionComment(input) {
    const data = await this.graphql(ADD_COMMENT_MUTATION, {
      input: { discussionId: input.discussionId, body: input.body },
    });
    const comment = data.addDiscussionComment && data.addDiscussionComment.comment;
    if (!comment || !comment.id) {
      throw new GitHubError("GitHub não devolveu o comentário criado.", {
        status: 502,
        code: "COMMENT_CREATE_FAILED",
      });
    }
    const author = normalizeUser(comment.author);
    return {
      subjectId: String(comment.id),
      url: String(comment.url || ""),
      createdAt: String(comment.createdAt || ""),
      authorId: author.authorId,
      handle: author.handle,
    };
  }

  async getDiscussionComment(commentId) {
    const data = await this.graphql(NODE_QUERY, { id: commentId });
    const node = data.node;
    if (!node || node.__typename !== "DiscussionComment") {
      throw new GitHubError("Comentário não encontrado no GitHub Discussions.", {
        status: 404,
        code: "COMMENT_NOT_FOUND",
      });
    }
    const author = normalizeUser(node.author);
    return {
      subjectId: String(node.id),
      kind: "DiscussionComment",
      body: String(node.body || ""),
      url: String(node.url || ""),
      createdAt: String(node.createdAt || ""),
      authorId: author.authorId,
      authorHandle: author.handle,
      discussion: node.discussion
        ? {
            id: String(node.discussion.id),
            number: Number(node.discussion.number),
            url: String(node.discussion.url || ""),
            title: String(node.discussion.title || ""),
            repository: node.discussion.repository
              ? String(node.discussion.repository.nameWithOwner)
              : "",
          }
        : null,
    };
  }

  /** Info de um subjectId (D_… ou DC_…) com autor e discussion de origem. */
  async getSubject(subjectId) {
    const data = await this.graphql(NODE_QUERY, { id: subjectId });
    const node = data.node;
    if (!node) {
      throw new GitHubError("Assunto não encontrado no GitHub.", {
        status: 404,
        code: "SUBJECT_NOT_FOUND",
      });
    }
    const author = normalizeUser(node.author);
    if (node.__typename === "DiscussionComment") {
      return {
        subjectId: String(node.id),
        kind: "DiscussionComment",
        url: String(node.url || ""),
        createdAt: String(node.createdAt || ""),
        authorId: author.authorId,
        authorHandle: author.handle,
        discussion: node.discussion
          ? {
              id: String(node.discussion.id),
              number: Number(node.discussion.number),
              url: String(node.discussion.url || ""),
              title: String(node.discussion.title || ""),
              repository: node.discussion.repository
                ? String(node.discussion.repository.nameWithOwner)
                : "",
            }
          : null,
      };
    }
    if (node.__typename === "Discussion") {
      return {
        subjectId: String(node.id),
        kind: "Discussion",
        url: String(node.url || ""),
        createdAt: "",
        authorId: author.authorId,
        authorHandle: author.handle,
        discussion: {
          id: String(node.id),
          number: 0,
          url: String(node.url || ""),
          title: String(node.title || ""),
        },
      };
    }
    throw new GitHubError("Tipo de assunto não suportado para apoio.", {
      status: 400,
      code: "SUBJECT_UNSUPPORTED",
    });
  }

  /** Todas as reações do subject, paginadas (sem truncar a união de contas). */
  async getAllReactions(subjectId) {
    const reactions = [];
    let cursor = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const data = await this.graphql(REACTIONS_QUERY, { id: subjectId, cursor });
      const node = data.node;
      if (!node) {
        throw new GitHubError("Assunto não encontrado no GitHub.", {
          status: 404,
          code: "SUBJECT_NOT_FOUND",
        });
      }
      const connection = node.reactions;
      if (!connection) {
        throw new GitHubError("Assunto não suporta reações.", {
          status: 400,
          code: "SUBJECT_UNSUPPORTED",
        });
      }
      for (const reaction of connection.nodes || []) {
        if (reaction) reactions.push(reaction);
      }
      if (!connection.pageInfo || !connection.pageInfo.hasNextPage) return reactions;
      cursor = connection.pageInfo.endCursor;
    }
    throw new GitHubError("Paginação de reações excedeu o limite seguro.", {
      status: 502,
      code: "PAGINATION_LIMIT",
    });
  }

  async addReaction(subjectId, content) {
    await this.graphql(ADD_REACTION_MUTATION, { subjectId, content });
  }

  async removeReaction(subjectId, content) {
    await this.graphql(REMOVE_REACTION_MUTATION, { subjectId, content });
  }

  /* ------------------------------------------------------------ curadoria */

  /** Dispara o repository_dispatch que acorda o workflow protegido. */
  async dispatchEvent(eventType, payload) {
    await this.rest(`/repos/${this.repo}/dispatches`, {
      method: "POST",
      body: { event_type: eventType, client_payload: payload },
    });
    return true;
  }

  /** Texto de um arquivo em `ref` via Git Trees + Blobs (sem limite de 1 MB). */
  async getRepoFileText(filePath, ref = "main") {
    const tree = await this.rest(
      `/repos/${this.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`
    );
    const entries = tree && tree.data && Array.isArray(tree.data.tree) ? tree.data.tree : [];
    const entry = entries.find((item) => item && item.type === "blob" && item.path === filePath);
    if (!entry) {
      throw new GitHubError(`Arquivo não encontrado em ${ref}: ${filePath}`, {
        status: 404,
        code: "FILE_NOT_FOUND",
      });
    }
    const blob = await this.rest(`/repos/${this.repo}/git/blobs/${entry.sha}`);
    const encoding = blob && blob.data && blob.data.encoding;
    const content = blob && blob.data && blob.data.content;
    if (encoding !== "base64" || typeof content !== "string") {
      throw new GitHubError(`Blob inválido para ${filePath}.`, {
        status: 502,
        code: "BLOB_INVALID",
      });
    }
    return Buffer.from(content, "base64").toString("utf8");
  }

  async getHeadOid(branch = "main") {
    const ref = await this.rest(`/repos/${this.repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    const oid = ref && ref.data && ref.data.object && ref.data.object.sha;
    if (!oid) {
      throw new GitHubError(`Não foi possível ler o HEAD de ${branch}.`, {
        status: 502,
        code: "REF_UNKNOWN",
      });
    }
    return String(oid);
  }

  /**
   * Commit em `main` via `createCommitOnBranch` (commit criado/assinado pela
   * GitHub) com `expectedHeadOid`: se main andou no meio-tempo, o commit falha
   * em vez de sobrescrever curadoria concorrente.
   */
  async commitFile(input) {
    const branch = input.branch || "main";
    const expectedHeadOid = input.expectedHeadOid || (await this.getHeadOid(branch));
    const data = await this.graphql(CREATE_COMMIT_MUTATION, {
      input: {
        branch: { repositoryNameWithOwner: this.repo, branchName: branch },
        expectedHeadOid,
        message: {
          headline: String(input.headline || "curadoria: atualizar síntese").slice(0, 72),
          body: String(input.body || ""),
        },
        fileChanges: {
          additions: [
            {
              path: input.path,
              contents: Buffer.from(String(input.content || ""), "utf8").toString("base64"),
            },
          ],
        },
      },
    });
    const commit = data.createCommitOnBranch && data.createCommitOnBranch.commit;
    if (!commit || !commit.oid) {
      throw new GitHubError("GitHub não devolveu o commit criado.", {
        status: 502,
        code: "COMMIT_FAILED",
      });
    }
    return { oid: String(commit.oid), url: String(commit.url || "") };
  }
}
