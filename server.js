const fs = require("fs");
const path = require("path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const express = require("express");
 
class DynamicGrpcServer {
  constructor(port = 9090) {
    this.port = port;
    this.server = new grpc.Server();
    this.protoFiles = {};
    this.serviceHandlers = {};
    this.responseMap = {};
    this.overrideResponse = null;
 
    // Directories for proto files and response configs
    this.protoDir = process.env.PROTO_DIR || "./example/app/protos";
    this.configDir = process.env.CONFIG_DIR || "./example/app/config";
 
    // Ensure directories exist
    this.ensureDirectoryExists(this.protoDir);
    this.ensureDirectoryExists(this.configDir);
 
    // Create an Express app for the HTTP API
    this.app = express();
    this.app.use(express.json());
 
    // Define the /api/override endpoint
    this.app.post("/api/override", (req, res) => {
      const { serviceName, methodName, responsePayload } = req.body;
      if (serviceName && methodName && responsePayload) {
        this.overrideResponse = { serviceName, methodName, responsePayload };
        res.status(200).send("Override response set successfully");
      } else {
        res.status(400).send("Invalid payload");
      }
    });
 
    // Start the HTTP server on port 8080
    this.app.listen(8080, () => {
      console.log("HTTP API server started on port 8080");
    });
  }
 
  ensureDirectoryExists(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
 
  loadProtoFiles() {
    console.log(`Loading proto files from ${this.protoDir}`);
    const files = fs.readdirSync(this.protoDir);
 
    files.forEach((file) => {
      if (path.extname(file) === ".proto") {
        const protoPath = path.join(this.protoDir, file);
        console.log(`Loading proto: ${protoPath}`);
 
        try {
          const packageDefinition = protoLoader.loadSync(protoPath, {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true,
          });
 
          const protoDefinition = grpc.loadPackageDefinition(packageDefinition);
          const fileName = path.basename(file, ".proto");
          this.protoFiles[fileName] = protoDefinition;
          console.log(`Successfully loaded proto: ${fileName}`);
        } catch (error) {
          console.error(`Error loading proto file ${file}:`, error);
        }
      }
    });
  }
 
  loadResponseMappings() {
    const responsesPath = path.join(this.configDir, "responses.json");
    if (fs.existsSync(responsesPath)) {
      try {
        const data = fs.readFileSync(responsesPath, "utf8");
        this.responseMap = JSON.parse(data);
        console.log("Loaded response mappings:", Object.keys(this.responseMap));
      } catch (error) {
        console.error("Error loading response mappings:", error);
        this.responseMap = {};
      }
    } else {
      console.log("No response mappings found");
      this.responseMap = {};
    }
  }
 
  createServiceHandlers() {
    // Clear existing handlers
    this.serviceHandlers = {};
 
    // Create handlers for each service in the response map
    for (const [serviceName, methods] of Object.entries(this.responseMap)) {
      console.log(`Creating handler for service: ${serviceName}`);
 
      const serviceHandler = {};
 
      for (const [methodName, responses] of Object.entries(methods)) {
        console.log(`Creating handler for method: ${methodName}`);
 
        // Create a handler for this method
        serviceHandler[methodName] = (call, callback) => {
          console.log(
            `Received call to ${serviceName}.${methodName}`,
            call.request
          );
 
          // Check for override response
          if (
            this.overrideResponse &&
            this.overrideResponse.serviceName === serviceName &&
            this.overrideResponse.methodName === methodName
          ) {
            console.log(
              "Using override response:",
              this.overrideResponse.responsePayload
            );
            callback(null, this.overrideResponse.responsePayload);
            this.overrideResponse = null; // Clear the override after use
            return;
          }
 
          // Find the appropriate response
          // This allows more complex matching logic based on request values
          let response = responses;
          if (typeof responses === "object" && !Array.isArray(responses)) {
            // If responses is a map of request patterns to responses
            for (const [pattern, resp] of Object.entries(responses)) {
              response = resp;
              try {
                const patternObj = JSON.parse(pattern);
                let match = true;
 
                // Check if all fields in the pattern match the request
                for (const [key, value] of Object.entries(patternObj)) {
                  if (call.request[key] !== value) {
                    match = false;
                    break;
                  }
                }
 
                if (match) {
                  response = resp;
                  break;
                }
              } catch (e) {
                // If pattern is not valid JSON, skip it
                continue;
              }
            }
          }
 
 
 
          console.log(`Responding with:`, response);
          callback(null, response);
        };
      }
 
      this.serviceHandlers[serviceName] = serviceHandler;
    }
  }
 
  registerServices() {
    for (const [serviceName, handler] of Object.entries(this.serviceHandlers)) {
      console.log(`Registering service: ${serviceName}`);
 
      // Find the service definition in the loaded proto files
      let serviceDefinition = null;
      let packageName = "";
 
      // Look for the service in all loaded proto files
      for (const [protoName, proto] of Object.entries(this.protoFiles)) {
        const serviceComponents = serviceName.split(".");
        let current = proto;
        // Navigate through the package hierarchy
        for (let i = 0; i < serviceComponents.length; i++) {
          const component = serviceComponents[i];
          if (current[component]) {
            current = current[component];
 
            // If this is the last component and it has service interface methods
            if (i === serviceComponents.length - 1 && current.service) {
              serviceDefinition = current;
              // Build the package name for registration
              packageName = serviceComponents.slice(0, i).join(".");
              break;
            }
          } else {
            break;
          }
        }
 
        if (serviceDefinition) break;
      }
 
      if (serviceDefinition && serviceDefinition.service) {
        try {
          this.server.addService(serviceDefinition.service, handler);
          console.log(`Successfully registered service: ${serviceName}`);
        } catch (error) {
          if (!error.message.includes("already provided")) {
            console.error(`Error registering service ${serviceName}:`, error);
          }
        }
      } else {
        console.error(`Service definition not found for: ${serviceName}`);
      }
    }
  }
 
  start() {
    // Load all proto files first
    this.loadProtoFiles();
 
    // Load response mappings
    this.loadResponseMappings();
 
    // Create service handlers based on response mappings
    this.createServiceHandlers();
 
    // Register all services with the server
    this.registerServices();
 
    // Start the server
    const serverAddress = `0.0.0.0:${this.port}`;
    this.server.bindAsync(
      serverAddress,
      grpc.ServerCredentials.createInsecure(),
      (error, port) => {
        if (error) {
          console.error("Failed to start server:", error);
          return;
        }
 
        this.server.start();
        console.log(`gRPC server started on ${serverAddress}`);
      }
    );
 
    // Watch for changes in protos directory
    fs.watch(this.protoDir, (eventType, filename) => {
      if (filename) {
        console.log(`Protos directory changed: ${filename}`);
        this.loadProtoFiles();
        this.registerServices();
      }
    });
 
    // Watch for changes in config directory
    fs.watch(this.configDir, (eventType, filename) => {
      if (filename) {
        console.log(`Config directory changed: ${filename}`);
        this.loadResponseMappings();
        this.createServiceHandlers();
        this.registerServices();
      }
    });
  }
 
  stop() {
    return new Promise((resolve) => {
      this.server.tryShutdown(() => {
        console.log("Server shut down");
        resolve();
      });
    });
  }
 
  // Method to add or update a response mapping at runtime
  addResponseMapping(serviceName, methodName, requestPattern, response) {
    if (!this.responseMap[serviceName]) {
      this.responseMap[serviceName] = {};
    }
 
    if (!this.responseMap[serviceName][methodName]) {
      this.responseMap[serviceName][methodName] = {};
    }
 
    if (requestPattern) {
      // If a request pattern is provided, store response under that pattern
      if (
        typeof this.responseMap[serviceName][methodName] !== "object" ||
        Array.isArray(this.responseMap[serviceName][methodName])
      ) {
        this.responseMap[serviceName][methodName] = {};
      }
      this.responseMap[serviceName][methodName][
        JSON.stringify(requestPattern)
      ] = response;
    } else {
      // If no pattern, use this as the default response
      this.responseMap[serviceName][methodName] = response;
    }
 
    // Save updated mappings to file
    this.saveResponseMappings();
 
    // Recreate handlers and re-register services to apply changes
    this.createServiceHandlers();
    this.registerServices();
  }
 
  // Method to save response mappings to file
  saveResponseMappings() {
    const responsesPath = path.join(this.configDir, "responses.json");
    fs.writeFileSync(responsesPath, JSON.stringify(this.responseMap, null, 2));
  }
 
  // Method to add a proto file at runtime
  addProtoFile(fileName, content) {
    const filePath = path.join(this.protoDir, fileName);
    fs.writeFileSync(filePath, content);
 
    // Reload proto files
    this.loadProtoFiles();
 
    // Re-register services
    this.registerServices();
  }
}
 
// If this file is run directly, start the server
if (require.main === module) {
  const port = process.env.PORT || 9090;
  const server = new DynamicGrpcServer(port);
  server.start();
 
  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("Shutting down...");
    await server.stop();
    process.exit(0);
  });
}
 
module.exports = DynamicGrpcServer;