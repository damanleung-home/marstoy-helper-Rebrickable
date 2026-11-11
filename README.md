# Marstoy BrickLink Set Finder

> Originally created by [Nicolas Dalsass](https://github.com/nicolasdalsass/marstoy-helper). This fork replaces the BrickLink dependency with bundled Rebrickable data.

This Firefox extension enhances Marstoy.net by adding BrickLink set names to product codes that match the pattern "M" followed by 5 digits, and improves the product images.

## Features

- Automatically detects product codes in the format M##### on marstoy.net
- Looks up the corresponding set name (using the reversed digits) in a bundled copy of Rebrickable's set catalog, so it keeps working when BrickLink is down
- Falls back to a BrickLink lookup only for sets newer than the bundled catalog
- Appends the set name next to the product code, linked to the set's Rebrickable page
- Replaces product images with official set images (Rebrickable CDN first, then BrickLink); if neither loads, the original Marstoy image is kept
- Implements intelligent image caching to improve performance
- Optimizes image quality through advanced downscaling algorithms
- Removes lazy loading attributes for immediate image display

## Installation

### Temporary Installation (Development/Testing)
1. Open Firefox and navigate to `about:debugging`
2. Click on "This Firefox" in the left sidebar
3. Click on "Load Temporary Add-on"
4. Navigate to the extension folder and select the `manifest.json` file

### Permanent Installation (Firefox Add-ons Store)
1. Visit the Firefox Add-ons store (link to be added)
2. Click "Add to Firefox"
3. Confirm the installation

Note: The extension ID is only required for permanent installation through the Firefox Add-ons store. For temporary installation during development, no ID is needed.

## Usage

1. Visit any page on marstoy.net
2. The extension will automatically scan the page for product codes
3. When it finds a code (e.g., "M12345"), it will:
   - Look up the corresponding set name for "54321"
   - Replace the product image with the set's official image
4. The set name will be appended next to the product code

## Updating the set catalog

Set names live in `sets.js`, generated from Rebrickable's free catalog dump (no API key needed). Refresh it when new sets come out:

```bash
python3 scripts/update_sets.py
```

## Technical Details

- Images are optimized using a multi-step downscaling algorithm for better quality
- Images are cached in both localStorage and sessionStorage for improved performance
- Cache size is automatically managed to prevent storage overflow
- Images are processed with sharpening filters for better clarity
- Lazy loading is disabled to ensure immediate image display

## Notes

- The extension needs permission to access marstoy.net, rebrickable.com and bricklink.com
- Set names work offline from the bundled catalog; images need an internet connection
- Some set numbers might not have a matching LEGO set
- Image caching requires browser storage permissions
- Cache can be cleared using the browser's storage settings 