const { execSync } = require('child_process');
const path = require('path');

try {
    console.log('1. Building Vite project...');
    execSync('npm run build', { stdio: 'inherit' });

    console.log('2. Packaging unpacked app...');
    // Build only the directory first so we can clean it
    execSync('npx electron-builder build --mac --dir -c.mac.identity=null', { stdio: 'inherit' });

    const appPath = path.join(__dirname, '../dist-electron/mac-arm64/El Jardin ERP.app');
    const tmpDir = '/tmp/jardin_erp_build';
    const tmpAppPath = path.join(tmpDir, 'El Jardin ERP.app');

    console.log(`3. Copying to ${tmpDir} to escape Dropbox...`);
    execSync(`rm -rf "${tmpDir}"`, { stdio: 'inherit' });
    execSync(`mkdir -p "${tmpDir}"`, { stdio: 'inherit' });
    // cp -R copies recursively. We don't use -X here because we want to strip them explicitly to be sure.
    // Actually, cp -X *discards* resource forks and xattrs. Let's use that!
    execSync(`cp -R -X "${appPath}" "${tmpDir}/"`, { stdio: 'inherit' });

    console.log(`4. Cleaning xattrs from ${tmpAppPath} (Aggressive)...`);
    // 'com.apple.provenance' is sticky and often survives -c. We must remove it explicitly.
    try {
        execSync(`xattr -dr com.apple.provenance "${tmpAppPath}"`, { stdio: 'inherit' });
    } catch (e) {
        // It might fail if the attribute doesn't exist on *some* files, but we want to ignore that.
        // Actually xattr -dr usually succeeds if it finds nothing? Or fails? 
        // We'll ignore errors here to be safe, as long as we try.
        console.log('  (ignored error removing provenance)');
    }

    try {
        execSync(`xattr -dr com.apple.quarantine "${tmpAppPath}"`, { stdio: 'inherit' });
    } catch (e) {
        console.log('  (ignored error removing quarantine)');
    }

    // Also run persistent clear
    execSync(`xattr -rc "${tmpAppPath}"`, { stdio: 'inherit' });

    // Run dot_clean to merge/remove AppleDouble files
    try {
        execSync(`dot_clean -mn "${tmpAppPath}"`, { stdio: 'inherit' });
    } catch (e) {
        console.log('  (ignored error running dot_clean)');
    }

    console.log('5. Manual Ad-Hoc Signing in /tmp...');
    execSync(`codesign --force --deep --sign - "${tmpAppPath}"`, { stdio: 'inherit' });

    console.log('6. Packaging into DMG/ZIP from /tmp...');
    // Do NOT copy back to Dropbox folder, as that re-applies attributes.
    // Use --prepackaged to tell electron-builder to use the clean app in /tmp.
    // We also valid the output directory to be the project dist.

    console.log('Running electron-builder with --prepackaged...');
    execSync(`npx electron-builder build --mac --prepackaged "${tmpAppPath}"`, { stdio: 'inherit' });

    console.log('Build complete!');
} catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
}
