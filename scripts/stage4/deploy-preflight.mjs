import { deploymentIssues, inspectDeploymentFiles, tlsMaterialIssues } from './policy.mjs';

const files = await inspectDeploymentFiles(process.env);
const issues = [...deploymentIssues(process.env), ...files];
if (!files.length && !issues.length) issues.push(...tlsMaterialIssues(process.env));
if (issues.length) {
  console.error('BLOCKED: Stage 4 production deployment preflight failed:');
  for (const issue of issues) console.error(` - ${issue}`);
  console.error('No deployments or secret contents were touched. Follow docs/STAGE4_DEPLOYMENT.md.');
  process.exitCode = 1;
} else {
  console.log('PASS: Required production deployment settings, read-only image identities, secret file presence, TLS key match, certificate expiry and HTTPS domain configuration passed preflight.');
  console.log('NOT VERIFIED: public CA trust chain, nginx runtime syntax, backup restore, migration safety, DNS and HTTPS from the public internet.');
}
