import Fastify from "fastify";
import fastifyFormBody from "@fastify/formbody";
import fastifyWs from "@fastify/websocket";
import dotenv from "dotenv";

import {
  RealtimeClient,
  RealtimeServer,
} from "@openai/agents-realtime";

import { z } from "zod";
import { TwilioRealtimeTransportLayer } from "@openai/agents-extensions";

import { menu, agentInstructions } from "./src/agent-config.js";

dotenv.config();

const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
  process.exit(1);
}

const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

/**
 * Create our Agent Server (acts as the AI brain)
 */

const agentServer = new RealtimeServer({
  instructions: agentInstructions,
  model: "gpt-4o-realtime-preview-2024-12-17",

  tools: {
    get_menu: {
      description: "Returns kebab menu.",
      parameters: z.object({}),
      execute: async () => {
        return { output: menu };
      }
    },

    submit_order: {
      description: "Submit order to shop.",
      parameters: z.object({
        customer_name: z.string().optional(),
        phone_number: z.string().optional(),
        order_type: z.enum(["recogida", "domicilio"]),
        delivery_address: z.string().optional(),
        items: z.array(
          z.object({
            item_id: z.string(),
            name: z.string(),
            size: z.string().optional(),
            quantity: z.number(),
            sauces: z.array(z.string()).optional(),
            extras: z.array(z.string()).optional(),
          })
        ),
        comment: z.string().optional(),
        total_estimated_price_eur: z.number().optional(),
      }),
      execute: async (order) => {
        console.log("🧾 NEW ORDER:", JSON.stringify(order, null, 2));
        return { output: "Order sent successfully." };
      }
    }
  }
});

/**
 * Basic health-check
 */

fastify.get("/", async (_, reply) => {
  reply.send({ message: "Kebab Voice Agent Online!" });
});

/**
 * Handle incoming Twilio calls
 */

fastify.all("/clients/:shop/incoming-call", async (request, reply) => {
  const shop = request.params.shop;
  const host = request.headers.host;

  console.log(`📞 Incoming call for: ${shop}`);

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
 * WebSocket streaming endpoint for the call
 */

fastify.register(async (app) => {
  app.get(
    "/media-stream/:shop",
    { websocket: true },
    async (connection, req) => {
      const shop = req.params.shop;

      console.log(`🔊 Twilio media stream connected for: ${shop}`);

      const twilioLayer = new TwilioRealtimeTransportLayer({
        twilioWebSocket: connection,
      });

      const agent = new RealtimeClient({
        server: agentServer,
        transport: twilioLayer,
        apiKey: OPENAI_API_KEY,
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice: "verse",
      });

      agent.on("error", (err) => {
        console.error("❌ Agent error:", err);
      });

      await agent.connect();
      console.log("✅ Agent connected.");
    }
  );
});

fastify.listen({ port: PORT, host: "0.0.0.0" }, () => {
  console.log("🚀 Server running on port", PORT);
});
