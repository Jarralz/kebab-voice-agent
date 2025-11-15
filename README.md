# Kebab Voice Agent

AI-powered phone assistant for kebab shops using:

- Twilio Voice Streaming
- OpenAI Realtime Agents
- Node.js + Fastify
- Railway hosting

## Running locally

npm install
cp .env.example .env
node server.js

markdown
Copy code

## Deploying to Railway

1. Push repo to GitHub
2. Create New Project → Deploy from GitHub
3. Add your `.env` variables
4. Railway gives you a public URL like:

https://yourapp.up.railway.app

perl
Copy code

## Twilio Webhook

For each shop:

https://yourapp.up.railway.app/clients/SHOPNAME/incoming-call

javascript
Copy code

Set this in Twilio → Phone Number → Voice → Webhook (POST).
