# Project Recovery Suite

PROJECT RESTORATION AND SETUP INSTRUCTIONS

PHASE 1: CONTEXT INGESTION & ARCHITECTURE ANALYSIS

Before generating or modifying any code, please locate and read the ARCHITECTURE.md file in the root of the provided ZIP archive. It is important to fully understand the application's logic, tech stack, state management, database structure, and custom solutions. Please adapt the setup to match the exact architectural rules defined in this file.

PHASE 2: CORE OBJECTIVE

Act as a Senior Software Architect. Please reconstruct the provided project files from the ZIP archive with full functional and visual fidelity.

Required modification during setup:

    REMOVE GOOGLE ADS: Please safely remove any Google Ads (AdMob, AdSense, etc.) initialization, SDK dependencies, UI ad banners, and related logic. The application must be completely ad-free while maintaining all other native functionalities.

PHASE 3: SYSTEM RECOVERY (RESTORE FROM ZIP)

Please ensure the following configurations are restored exactly as they were in the original ZIP archive:

A. UI SCALING & TAILWIND CONFIGURATION

    Restore index.html. Ensure the viewport meta tag is exactly: <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />

    Inspect tailwind.config.ts (or .js) and src/index.css. Restore all root font-size scales, custom mappings, and breakpoints.

    Ensure touch-action: manipulation, user-select: none, and safe-area inset paddings are fully restored.

B. ANDROID NATIVE PERMISSIONS & MANIFEST

    Re-insert media storage permissions (READ_MEDIA_IMAGES, READ_MEDIA_VIDEO, READ_EXTERNAL_STORAGE, WRITE_EXTERNAL_STORAGE, ACCESS_MEDIA_LOCATION).

    Include android:requestLegacyExternalStorage="true" in the <application> tag.

    Restore all <queries> declarations.

    Preserve android:configChanges parameters on the main activity.

C. CAPACITOR CONFIGURATION

    Restore settings including webDir: "dist", and server: { androidScheme: 'https', cleartext: true }.

    Ensure proper file scheme conversion (Capacitor.convertFileSrc(path)) is maintained for local media.

D. MEDIA SCANNING HANDLERS

    Check all hooks handling media indexing. Ensure runtime permission checks happen before querying storage.

    Ensure the app scans directories recursively to fetch metadata exactly as originally written in the ZIP.

E. LAUNCHER ASSETS & BUILD

    Ensure all original PNG launcher icons from mipmap-* are present.

    Check build.gradle to ensure compileSdk, targetSdk, and dependencies match the original structure.

PHASE 4: IMPLEMENTATION STANDARDS

    Comprehensive Setup: Recreate every feature, utility, component, and routing config exactly as in the source (without the ads).

    No Placeholders: Please provide complete code blocks. Do not use shortcuts, stubs, or comments like "// existing code here".

    Full File Output: When modifying or generating a file, please output the entire unabbreviated file from start to finish.

    Original Code: Please use the exact original logic from the ZIP archive instead of generating new template code.

EXECUTION STRATEGY:

Step 1: Output a brief confirmation that you have read ARCHITECTURE.md and list the core stack you absorbed.

Step 2: Begin the extraction, ad removal, and full unabbreviated code generation following the standards above.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f30e1934-1bd6-4367-bce6-14e7e6748278).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
