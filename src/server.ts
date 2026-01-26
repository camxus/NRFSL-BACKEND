import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes";
import { createCorsConfig } from "./utils/cors";
import { APIGatewayProxyEvent } from "aws-lambda";
import { errorHandler } from "./middleware/errorMiddleware";
import serverless from "serverless-http";
import multipart from "lambda-multipart-parser";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors(createCorsConfig()));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Routes
app.use("/api/auth", authRoutes);


// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ message: "Server is running" });
});

// Error handling middleware
app.use(errorHandler);

if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

export const handler = serverless(app, {
  request: async (req: Request, event: APIGatewayProxyEvent) => {
    let body: any = event.body;


    if (body) {
      // If JSON content
      if (body && event.headers["content-type"]?.includes("application/json")) {
        try {
          body = JSON.parse(body.toString()); // parse JSON safely
        } catch { }
      }

      // If multipart/form-data
      if (event.headers["content-type"]?.includes("multipart/form-data")) {
        try {
          // Temporarily override body with Buffer
          const originalBody = event.body;
          (event as any).body = body; // body is already a Buffer

          const parsed = await multipart.parse(event);
          body = parsed; // parsed.files and parsed.fields

          // Restore original event.body (optional)
          (event as any).body = originalBody;
        } catch (err) {
          console.error("Multipart parse error:", err);
        }
      }
    }

    // Assign to Express req.body
    (req as any).body = body;
  },
});

