# Apple Notes Parser

<div align="left">
  <img src="assets/logo.png" alt="Apple Notes Parser Logo" width="200"/>
</div>

A powerful tool for parsing and converting Apple Notes data into other formats. This project allows you to extract your Apple Notes content and convert it into a more accessible format.

> **Note**: This tool is currently only supported on macOS systems, as it directly accesses the Apple Notes database which is only available on macOS.

## Features

- Parse Apple Notes database files
- Convert notes to Markdown format
- Handle attachments and media files
- Support for multiple accounts
- Preserve note formatting and structure
- Export to customizable output formats

## Prerequisites

- macOS operating system
- [Bun](https://bun.sh/) (JavaScript runtime)
- TypeScript 5.0 or later
- Node.js dependencies (for file system operations)

## Installation

### Option 1: Download Pre-built Binary (Recommended)

1. Go to the [Releases](https://github.com/yourusername/notes-parser/releases) page
2. Download the macOS binary
3. Make the binary executable:
   ```bash
   chmod +x notes-parser
   ```

### Option 2: Build from Source

1. Clone the repository:

```bash
git clone https://github.com/yourusername/notes-parser.git
cd notes-parser
```

2. Install dependencies:

```bash
bun install
```

3. Build the binary:

```bash
bun run build:binary
```

## Usage

Run the parser:

```bash
./notes-parser
```

The tool will automatically:

- Locate your Apple Notes database
- Parse the content
- Convert notes to Markdown
- Save the output to your Documents folder

### Important Notes

1. **macOS Only**: This tool is designed to work exclusively on macOS systems.

2. **Full Disk Access Required**: The tool needs access to your Apple Notes database, which requires Full Disk Access permission. If you encounter an error like:
   ```
   Data import failed. Cannot access Apple Notes data folder at: /Users/username/~/Library/Group Containers/group.com.apple.notes
   ```
   
   You need to grant Full Disk Access permission to the terminal application you're using:
   
   1. Open System Settings (System Preferences)
   2. Go to Privacy & Security
   3. Select Full Disk Access
   4. Click the + button
   5. Navigate to `/Applications/Utilities/Terminal.app` (or your preferred terminal app)
   6. Click Open
   
   If you're using a different terminal application (like iTerm2), make sure to add that application instead.
   
   After granting the permission, restart your terminal application and try running the command again.

3. **Data Safety**: The tool only reads your Apple Notes data and does not modify the original database. However, it's always recommended to have a backup of your important data before using any data conversion tools.

## Project Structure

```
notes-parser/
├── src/
│   ├── converters/     # Note format converters
│   ├── importer/       # Apple Notes import logic
│   ├── proto/          # Protocol Buffer definitions
│   ├── utils/          # Utility functions
│   └── main.ts         # Entry point
├── package.json        # Project configuration
└── tsconfig.json       # TypeScript configuration
```

## Development

### Building

To build the project:

```bash
bun run build:binary
```

### Dependencies

- `@zip.js/zip.js`: For handling ZIP files
- `protobufjs`: For Protocol Buffer parsing
- `plain-tag`: For template string processing
- `static-params`: For parameter handling

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Release Process

New releases are automatically created when a new tag is pushed to the repository. The release process:

1. Create and push a new tag:

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. GitHub Actions will automatically:
   - Build binary for macOS
   - Create a new release
   - Upload the binary as a release asset

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Apple Notes for providing the data format
- All contributors who have helped improve this project
