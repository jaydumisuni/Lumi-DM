"use strict";

function runtimeIdentityMatches(observed = {}, expected = {}) {
  const statusCode = Number(observed.statusCode || 0);
  const schema = String(observed.schema || "");
  const instance = String(observed.instance || "");
  const pid = Number(observed.pid || 0);
  const expectedSchema = String(expected.expectedSchema || "");
  const expectedInstance = String(expected.expectedInstance || "");
  const expectedPid = Number(expected.expectedPid || 0);
  const allowChildPid = expected.allowChildPid === true;

  if (statusCode !== 200) return false;
  if (!expectedSchema || schema !== expectedSchema) return false;
  if (!expectedInstance || instance !== expectedInstance) return false;
  if (!expectedPid || pid <= 0) return false;
  return pid === expectedPid || allowChildPid;
}

module.exports = { runtimeIdentityMatches };
