const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const numericIdentifier = /^\d+$/;

export function parseVersion(text) {
  if (typeof text !== 'string') throw new Error(`${JSON.stringify(text)} is not a Semantic Versioning 2.0.0 version`);
  const match = semverPattern.exec(text);
  if (!match) throw new Error(`${JSON.stringify(text)} is not a Semantic Versioning 2.0.0 version`);
  const [, major, minor, patch, prerelease, build] = match;
  if (build !== undefined) throw new Error(`${JSON.stringify(text)} carries build metadata, which no claudalisk version does (CLA-0098)`);
  return {
    major: BigInt(major),
    minor: BigInt(minor),
    patch: BigInt(patch),
    prerelease: prerelease === undefined ? [] : prerelease.split('.'),
  };
}

export function isVersion(text) {
  try {
    parseVersion(text);
    return true;
  } catch {
    return false;
  }
}

function sign(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareIdentifiers(left, right) {
  const leftNumeric = numericIdentifier.test(left);
  const rightNumeric = numericIdentifier.test(right);
  if (leftNumeric && rightNumeric) return sign(BigInt(left), BigInt(right));
  if (leftNumeric) return -1;
  if (rightNumeric) return 1;
  return sign(left, right);
}

function comparePrerelease(left, right) {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    const order = compareIdentifiers(left[index], right[index]);
    if (order !== 0) return order;
  }
  return sign(left.length, right.length);
}

export function compareVersions(leftText, rightText) {
  const left = parseVersion(leftText);
  const right = parseVersion(rightText);
  return sign(left.major, right.major)
    || sign(left.minor, right.minor)
    || sign(left.patch, right.patch)
    || comparePrerelease(left.prerelease, right.prerelease);
}

export function highestVersion(versions) {
  return versions.reduce((highest, version) => (highest === null || compareVersions(version, highest) > 0 ? version : highest), null);
}
