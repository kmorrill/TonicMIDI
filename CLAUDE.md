# Project Commands & Guidelines

## Build & Test Commands
- `npm test` - Run all Jest tests
- `npm test -- tests/unit/midi/midi-bus.test.js` - Run a specific test file
- `npm start` - Start the development server for the demo app
- `npm run build:demo` - Build the demo app for production

## Project Setup Notes
- Project uses ES modules (type: "module" in package.json)
- Tests run with Node's experimental VM modules support
- Jest configured to work with ES module imports

## Code Style Guidelines
- **Naming**: camelCase for variables/functions, PascalCase for classes
- **Imports**: ES6 module syntax (import/export)
- **Formatting**: 
  - Indent with 2 spaces
  - Use semicolons at end of statements
  - Use single quotes for strings
- **Error Handling**: Use try/catch blocks for async operations
- **Documentation**: JSDoc format for functions and classes
- **File Structure**: Group related functionality in subdirectories

## Testing Approach
- Unit tests for individual components
- Test pure functions in isolation
- Use mocks for external dependencies
- Follow the pattern in existing tests

## Architecture Guidelines
- Follow MIDI protocol standards
- Isolate hardware interfaces for testability
- Use event-based communication between components
- Maintain separation of concerns