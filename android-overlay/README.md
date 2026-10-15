# Android Overlay

This folder contains Android resource files that are copied over the generated
`android/` project after Capacitor initialises it. It provides:

- Adaptive launcher icons (`ic_launcher.xml`, `ic_launcher_round.xml`)
- Launcher foreground vector (`ic_launcher_foreground.xml`)
- Splash screen drawable (`splash.xml`) + colors
- LaunchTheme (`AppTheme.NoActionBarLaunch`) that prevents white flash on cold start

The GitHub Actions workflow at `.github/workflows/android-build.yml` copies this
folder into `android/app/src/main/res/` and rewrites `android/variables.gradle`
with production SDK versions (compile=35, target=35, min=24), then runs
`./gradlew assembleDebug` and `assembleRelease` and uploads the APKs as
workflow artifacts.

The adaptive icon xml automatically renders at every density
(mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi) — Android generates the raster variants at
install time from the vector foreground + background color.
