const { execSync } = require('child_process');

console.log('=========================================================');
console.log('⚡ SpokenEnglish Netlify Setup & Environment Sync');
console.log('=========================================================');

const execOptions = {
    stdio: 'inherit' // Allows interactive terminal input for login and site selection
};

try {
    console.log('\n[1/4] Logging into Netlify...');
    console.log('👉 This will open a browser window to authenticate.');
    execSync('npx netlify-cli@latest login', execOptions);

    console.log('\n[2/4] Linking local repository to your Netlify site...');
    console.log('👉 Please select "Use current git remote" or follow the prompts.');
    execSync('npx netlify-cli@latest link', execOptions);

    console.log('\n[3/4] Importing environment variables from .env to Netlify...');
    execSync('npx netlify-cli@latest env:import .env', execOptions);

    console.log('\n[4/4] Deploying updated configurations and site...');
    execSync('npx netlify-cli@latest deploy --prod', execOptions);

    console.log('\n=========================================================');
    console.log('✅ Netlify Setup Completed Successfully!');
    console.log('👉 Your live site is now synced with your database.');
    console.log('=========================================================');
} catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.log('Make sure you have an active internet connection and have Netlify CLI permissions.');
}
