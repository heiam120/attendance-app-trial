const { execSync } = require('child_process');

console.log('=========================================================');
console.log('🚀 SpokenEnglish Programmatic Git Deployer');
console.log('=========================================================');

const execOptions = {
    stdio: ['ignore', 'pipe', 'pipe'] // CRITICAL: Bypass Windows NUL access denied ACL bug
};

try {
    console.log('\n[1/3] Staging all modifications (git add .)...');
    const addResult = execSync('git add .', execOptions);
    console.log(addResult.toString().trim() || '[OK] Files staged successfully.');

    console.log('\n[2/3] Committing changes...');
    const commitMsg = 'feat: automated full-stack sync Phase 3 architecture and NeonDB live configuration';
    try {
        const commitResult = execSync(`git commit -m "${commitMsg}"`, execOptions);
        console.log(commitResult.toString().trim());
    } catch (commitErr) {
        // A commit error usually means there's nothing to commit.
        console.log(commitErr.stdout ? commitErr.stdout.toString() : commitErr.message);
    }

    console.log('\n[3/3] Pushing to remote repository (git push origin main)...');
    const pushResult = execSync('git push origin main', execOptions);
    console.log(pushResult.toString().trim() || '[OK] Pushed to remote successfully.');

    console.log('\n=========================================================');
    console.log('✅ Programmatic Git Pipeline Completed Successfully!');
    console.log('=========================================================');
} catch (error) {
    console.error('\n❌ GIT EXECUTION ERROR:');
    if (error.stderr) {
        console.error(error.stderr.toString());
    } else {
        console.error(error.message);
    }
    process.exit(1);
}
