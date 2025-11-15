import Fastify from "fastify";
import fastifyFormBody from "@fastify/formbody";
import fastifyWs from "@fastify/websocket";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

const PORT = process.env.PORT || 8080;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Health test
 */
fastify.get("/", async () => {
  return { message: "Kebab Voice Agent Online!" };
});

/**
 * Incoming call webhook
 */
fastify.all("/clients/:shop/incoming-call", async (request, reply) => {
  const shop = request.params.shop;
  const host = request.headers.host;

  console.log(`📞 Incoming call for ${shop}`);

  const twiml = `
    <Response>
      <Say language="es-ES">Hola, gracias por llamar. Un momento por favor…</Say>
      <Connect>
        <Stream url="wss://${host}/media-stream/${shop}" />
      </Connect>
    </Response>
  `.trim();

  reply.type("text/xml").send(twiml);
});

/**
 * WebSocket for media stream with Twilio
 */
fastify.register(async (app) => {
  app.get(
    "/media-stream/:shop",
    { websocket: true },
    (connection, request) => {

      console.log("🔊 Twilio stream connected");

      const realtime = client.realtime.connect({
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice: "verse",
      });

      // Twilio → OpenAI
      connection.on("message", async (msg) => {
        try {
          realtime.sendAudio(msg);
        } catch (error) {
          console.error("❌ Error sending audio:", error);
        }
      });

      // OpenAI → Twilio
      realtime.on("audio", (audioChunk) => {
        try {
          connection.send(audioChunk);
        } catch (error) {
          console.error("❌ Sending audio error:", error);
        }
      });

      connection.on("close", () => {
        console.log("❌ Twilio stream closed");
        realtime.close();
      });
    }
  );
});

/**
 * Start server
 */
fastify.listen({ port: PORT, host: "0.0.0.0" }, () => {
  console.log("🚀 Server running on port", PORT);
});
