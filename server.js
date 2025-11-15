import Fastify from "fastify";
import fastifyFormBody from "@fastify/formbody";
import fastifyWs from "@fastify/websocket";
import dotenv from "dotenv";

import {
  RealtimeAgent,
  RealtimeSession,
  backgroundResult,
  tool,
} from "@openai/agent-realtime";

import { TwilioRealtimeTransportLayer } from "@openai/agent-node";

import { z } from "zod";

dotenv.config();

const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY in environment variables.");
  process.exit(1);
}

const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

// Load agent instructions from separate file
import { agentInstructions, menu } from "./src/agent-config.js";

/**
 * Tools
 */
const getMenuTool = tool({
  name: "get_menu",
  description: "Returns the kebab menu.",
  parameters: z.object({}),
  execute: async () => backgroundResult(menu),
});

const submitOrderTool = tool({
  name: "submit_order",
  description: "Submit the final confirmed order to the shop.",
  parameters: z.object({
    customer_name: z.string().optional(),
    phone_number: z.string().optional(),
    order_type: z.enum(["recogida", "domicilio"]),
    delivery_address: z.string().optional(),
    items: z
      .array(
        z.object({
          item_id: z.string(),
          name: z.string(),
          size: z.string().optional(),
          quantity: z.number(),
          sauces: z.array(z.string()).optional(),
          extras: z.array(z.string()).optional(),
        })
      )
      .min(1),
    comment: z.string().optional(),
    total_estimated_price_eur: z.number().optional(),
  }),
  execute: async (order) => {
    console.log("🧾 New Order:", JSON.stringify(order, null, 2));

    // TODO: integrate WhatsApp / email here
    return backgroundResult("Order submitted successfully.");
  },
});

/**
 * Create Realtime Agent
 */
const kebabAgent = new RealtimeAgent({
  name: "KebabOrderAgent",
  instructions: agentInstructions,
  tools: [getMenuTool, submitOrderTool],
});

/**
 * Health-check
 */
fastify.get("/", (_, reply) => {
  reply.send({ message: "Kebab Voice Agent Online!" });
});

/**
 * Incoming call webhook (Twilio)
 */
fastify.all("/clients/:shop/incoming-call", async (request, reply) => {
  const host = request.headers.host;
  const shop = request.params.shop;

  console.log(`📞 Incoming call for shop: ${shop}`);

  const twiml = `
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Say language="es-ES">Hola, gracias por llamar. Un momento por favor…</Say>
      <Connect>
        <Stream url="wss://${host}/media-stream/${shop}"/>
      </Connect>
    </Response>
  `.trim();

  reply.type("text/xml").send(twiml);
});

/**
 * WebSocket for Twilio Streaming
 */
fastify.register(async (app) => {
  app.get(
    "/media-stream/:shop",
    { websocket: true },
    async (connection, request) => {
      const shop = request.params.shop;
      console.log(`🔊 Streaming call for shop: ${shop}`);

      const twilioLayer = new TwilioRealtimeTransportLayer({
        twilioWebSocket: connection,
      });

      const session = new RealtimeSession(kebabAgent, {
        transport: twilioLayer,
        model: "gpt-realtime",
        config: {
          audio: { output: { voice: "verse" } },
        },
      });

      session.on("tool_approval_requested", (_, __, approval) => {
        console.log(`✔ Auto-approved tool: ${approval.approvalItem.rawItem.name}`);
        session.approve(approval.approvalItem).catch(console.error);
      });

      await session.connect({ apiKey: OPENAI_API_KEY });
      console.log("✅ Connected to OpenAI Realtime for this call");
    }
  );
});

fastify.listen({ port: PORT, host: "0.0.0.0" }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log("🚀 Server running on port " + PORT);
});
