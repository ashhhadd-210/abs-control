// Deploy to Vercel from a git-free copy of the project.
// Why: the Vercel CLI attaches the local git commit author to every deployment, and Hobby
// accounts block deployments whose author email isn't the Vercel account's (readyStateReason:
// "commit author doesn't have permission"). Copying the sources without .git sidesteps that.
// Usage: npm run deploy   (requires `vercel login` once; the project link lives in .vercel/project.json)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abs-deploy-'));
for (const item of ['api', 'lib', 'public', 'package.json', 'vercel.json', '.vercelignore', 'README.md']) {
  fs.cpSync(path.join(root, item), path.join(tmp, item), { recursive: true, filter: p => !/[\\/]_[^\\/]*\.html$/.test(p) });
}
fs.mkdirSync(path.join(tmp, '.vercel'));
fs.copyFileSync(path.join(root, '.vercel', 'project.json'), path.join(tmp, '.vercel', 'project.json'));
const target = process.argv.includes('--preview') ? '' : '--prod';
console.log(`Deploying from ${tmp} ${target || '(preview)'} …`);
execSync(`vercel deploy ${target} --yes --archive=tgz`, { cwd: tmp, stdio: 'inherit', shell: true });
fs.rmSync(tmp, { recursive: true, force: true });
