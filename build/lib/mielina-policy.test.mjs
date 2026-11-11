import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeUniqueSupporters,
  isOfficialSourceCited,
  computeAuthorTier,
  defaultOfficialSources,
} from "./mielina-policy.mjs";

const reactions = (...users) => users.map((u, i) => ({ content: "ROCKET", user: { id: `U${i}`, login: u, __typename: "User" } }));

test("1 conta com ROCKET+UP+HEART conta 1 apoio", () => {
  const set = computeUniqueSupporters(
    [
      { content: "ROCKET", user: { id: "U1", login: "a", __typename: "User" } },
      { content: "THUMBS_UP", user: { id: "U1", login: "a", __typename: "User" } },
      { content: "HEART", user: { id: "U1", login: "a", __typename: "User" } },
    ],
    "AUTHOR"
  );
  assert.equal(set.size, 1);
});

test("auto-apoio e bots não contam", () => {
  const set = computeUniqueSupporters(
    [
      { content: "ROCKET", user: { id: "AUTHOR", login: "autor", __typename: "User" } },
      { content: "ROCKET", user: { id: "BOT", login: "dependabot[bot]", __typename: "Bot" } },
      { content: "THUMBS_UP", user: null },
      { content: "HEART", user: { id: "U2", login: "humano", __typename: "User" } },
    ],
    "AUTHOR"
  );
  assert.deepEqual([...set], ["U2"]);
});

test("fonte oficial exige https e allowlist (inclui subdomínio)", () => {
  const allow = defaultOfficialSources();
  assert.equal(isOfficialSourceCited("https://learn.microsoft.com/en-us/azure/", "RAN", allow), true);
  assert.equal(isOfficialSourceCited("https://pt-br.learn.microsoft.com/azure/", "RAN", allow), true);
  assert.equal(isOfficialSourceCited("http://learn.microsoft.com/", "RAN", allow), false);
  assert.equal(isOfficialSourceCited("https://evil.example.com/?x=learn.microsoft.com", "RAN", allow), false);
  assert.equal(isOfficialSourceCited("https://www.istqb.org/syllabus", "SYN", allow), true);
});

test("tier exige E (não OU) e respeita gates 25/3 e 100/3", () => {
  assert.equal(computeAuthorTier({ eligibleSupports: 25, officialCitedPosts: 2 }), 1);
  assert.equal(computeAuthorTier({ eligibleSupports: 25, officialCitedPosts: 3 }), 3);
  assert.equal(computeAuthorTier({ eligibleSupports: 100, distinctApprovedSyntheses: 2 }), 1);
  assert.equal(computeAuthorTier({ eligibleSupports: 100, distinctApprovedSyntheses: 3 }), 4);
  assert.equal(computeAuthorTier({ selfDeclaredPassed: true }), 2);
  assert.equal(computeAuthorTier({ authenticatedParticipations: 1 }), 1);
  assert.equal(computeAuthorTier({ eligibleSupports: 0 }, { isCurator: true }), 4);
});
