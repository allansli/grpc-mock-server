# gRPC Mock Server

A dynamic gRPC mock server that allows you to easily mock gRPC services based on proto files and response configurations.

## Features

- Dynamically loads proto files and creates mock services
- Configurable responses based on request patterns
- HTTP API to override the next response for testing specific scenarios
- Simple configuration via JSON files
- Auto-reloads when proto files or configuration changes
- Supports runtime addition of proto files and response mappings

## Getting Started

### Prerequisites

- Node.js (v12 or higher recommended)

### Installation

```bash
npm install
```

This will install all required dependencies:
- `@grpc/grpc-js`: Core gRPC functionality
- `@grpc/proto-loader`: For loading proto files
- `express`: For the HTTP API server

### Running the Server

```bash
node server.js
```

By default, the gRPC server runs on port 9090 and the HTTP API server runs on port 8080. You can configure these using environment variables:

```bash
PORT=9000 API_PORT=8000 node server.js
```

## Project Structure

- `server.js`: Main server implementation with the `DynamicGrpcServer` class
- `example/app/protos/`: Default directory for proto files (configurable via `PROTO_DIR`)
- `example/app/config/`: Default directory for response configurations (configurable via `CONFIG_DIR`)

## Configuration

### Proto Files

Place your `.proto` files in the `./example/app/protos` directory (or set the `PROTO_DIR` environment variable).

### Response Mappings

Define your response mappings in `./example/app/config/responses.json` (or set the `CONFIG_DIR` environment variable).

Example response configuration:

```json
{
  "helloworld.Greeter": {
    "sayHello": {
      "{\"name\":\"World\"}": {
        "message": "Hello World!"
      },
      "{\"name\":\"John\"}": {
        "message": "Hello John, how are you today?"
      }
    }
  }
}
```

## Response Override API

The server provides an HTTP API to override the next response for a specific service and method.

### List Available Services

```
GET /api/services
```

Returns a list of all available services and their methods.

### Override Next Response

```
POST /api/override
```

Request body:

```json
{
  "serviceName": "helloworld.Greeter",
  "methodName": "sayHello",
  "responsePayload": {
    "message": "This is an overridden response!"
  }
}
```

This will override the next response for the specified service and method. After the override is used once, the server will return to using the configured responses.

## Example Usage

Create a simple client to test the mock server:

```javascript
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const axios = require('axios');

// Load the proto file
const packageDefinition = protoLoader.loadSync('path/to/your/proto/file.proto');
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);

// Create a client
const client = new protoDescriptor.yourpackage.YourService(
  'localhost:9090',
  grpc.credentials.createInsecure()
);

// Make a normal request
client.yourMethod({param: 'value'}, (err, response) => {
  console.log('Normal response:', response);
  
  // Set an override for the next response
  axios.post('http://localhost:8080/api/override', {
    serviceName: 'yourpackage.YourService',
    methodName: 'yourMethod',
    responsePayload: {
      result: 'This is an overridden response!'
    }
  }).then(() => {
    // Make another request (which uses the override)
    client.yourMethod({param: 'value'}, (err, response) => {
      console.log('Overridden response:', response);
      
      // Make a third request (which returns to normal behavior)
      client.yourMethod({param: 'value'}, (err, response) => {
        console.log('Back to normal response:', response);
      });
    });
  });
});
```

## Advanced Features

### Auto-Reloading

The server automatically watches for changes in the proto files and response configuration directories. When changes are detected, the server will reload the affected components without requiring a restart.

### Runtime API

The `DynamicGrpcServer` class provides methods for runtime manipulation:

- `addResponseMapping(serviceName, methodName, requestPattern, response)`: Add or update a response mapping
- `saveResponseMappings()`: Save current response mappings to file
- `addProtoFile(fileName, content)`: Add a new proto file at runtime

## Use Cases

- Testing error scenarios
- Simulating specific response patterns
- Integration testing with controlled responses
- Developing against APIs that are not yet implemented
- Rapid prototyping of gRPC services

## Docker Support

A Dockerfile is included for containerized deployment:

```bash
docker build -t grpc-mock-server .
docker run -p 9090:9090 -p 8080:8080 grpc-mock-server
```

## License

MIT
