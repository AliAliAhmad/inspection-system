# Mobile App Asset Requirements

This directory must contain the following image assets before building the app.

## Required Files

### icon.png
- **Size:** 1024x1024 pixels
- **Format:** PNG (no transparency for iOS App Store)
- **Purpose:** Main app icon used on home screens and app stores

### adaptive-icon.png
- **Size:** 1024x1024 pixels
- **Format:** PNG with transparency
- **Purpose:** Foreground layer for Android adaptive icons. The system composites this over the background color (#1677ff). Keep the logo centered within the inner safe zone (~66% of the canvas) to avoid clipping on different device shapes.

### splash.png
- **Size:** 1284x2778 pixels
- **Format:** PNG
- **Purpose:** Splash/launch screen shown while the app loads. Displayed with `resizeMode: "contain"` on a #1677ff background, so the image is centered and scaled to fit without cropping.

## Brand Guidelines

| Token            | Value   |
|------------------|---------|
| Primary Blue     | #1677ff |
| Background Color | #1677ff |

## Recommended Tools

- **Figma** (https://www.figma.com) -- design and export at exact sizes
- **Sketch** (https://www.sketch.com) -- macOS design tool
- **App Icon Generator** (https://www.appicon.co/) -- upload a 1024x1024 source and generate all platform variants
- **Expo Icon Guide** (https://docs.expo.dev/develop/user-interface/app-icons/) -- official Expo documentation on icon and splash requirements
