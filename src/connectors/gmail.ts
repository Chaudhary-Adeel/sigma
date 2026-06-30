/**
 * Gmail connector (live via googleapis OAuth2).
 *
 * Uses the installed-app loopback flow: `sigma connector login gmail` opens a
 * consent URL and captures the code on a local redirect, persisting tokens under
 * SIGMA_HOME. Requires a Google OAuth client (Desktop app) with the Gmail API
 * enabled — see .env.example. Until configured, the connector reports needs_auth
 * rather than failing hard.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { URL } from "node:url";
import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { ENV, PATHS } from "../config/settings.js";
import type { Connector } from "./registry.js";

const SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }], details: {} };
}

function hasClient(): boolean {
  return Boolean(ENV.googleClientId && ENV.googleClientSecret);
}

function oauthClient() {
  if (!hasClient()) {
    throw new Error("Gmail not configured: set GOOGLE_OAUTH_CLIENT_ID/SECRET in .env");
  }
  const client = new google.auth.OAuth2(ENV.googleClientId, ENV.googleClientSecret, ENV.googleRedirect);
  if (existsSync(PATHS.gmailToken)) {
    client.setCredentials(JSON.parse(readFileSync(PATHS.gmailToken, "utf8")));
  }
  return client;
}

function gmailClient(): gmail_v1.Gmail {
  const auth = oauthClient();
  if (!existsSync(PATHS.gmailToken)) {
    throw new Error("Gmail not authorized: run `sigma connector login gmail`");
  }
  // Cast bridges the duplicate google-auth-library type copies (googleapis-common).
  return google.gmail({ version: "v1", auth: auth as never });
}

/** Run the interactive loopback OAuth flow and persist tokens. */
async function login(): Promise<void> {
  const client = oauthClient();
  const authUrl = client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES });
  const redirect = new URL(ENV.googleRedirect);
  const port = Number(redirect.port || 80);

  console.log("\nOpen this URL in your browser to authorize Gmail access:\n");
  console.log(authUrl + "\n");

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url ?? "/", `http://localhost:${port}`);
        if (reqUrl.pathname !== redirect.pathname) {
          res.writeHead(404).end();
          return;
        }
        const c = reqUrl.searchParams.get("code");
        res.writeHead(200, { "content-type": "text/html" }).end(
          "<h2>Sigma: Gmail authorized.</h2><p>You can close this tab.</p>",
        );
        server.close();
        if (c) resolve(c);
        else reject(new Error("No code in redirect"));
      } catch (e) {
        reject(e as Error);
      }
    });
    server.on("error", reject);
    server.listen(port, () => console.log(`Waiting for redirect on ${ENV.googleRedirect} …`));
  });

  const { tokens } = await client.getToken(code);
  writeFileSync(PATHS.gmailToken, JSON.stringify(tokens, null, 2));
  console.log("Gmail tokens saved.");
}

const listMessages = defineTool({
  name: "gmail_list",
  label: "Gmail: list",
  description: "List recent message subjects/senders. Optional Gmail search query.",
  parameters: Type.Object({
    query: Type.Optional(Type.String({ description: "Gmail search, e.g. 'is:unread newer_than:2d'" })),
    limit: Type.Optional(Type.Number()),
  }),
  execute: async (_id, params) => {
    const gmail = gmailClient();
    const list = await gmail.users.messages.list({
      userId: "me",
      q: params.query,
      maxResults: Math.min(params.limit ?? 15, 50),
    });
    const ids = list.data.messages ?? [];
    const rows: string[] = [];
    for (const m of ids) {
      const msg = await gmail.users.messages.get({
        userId: "me",
        id: m.id!,
        format: "metadata",
        metadataHeaders: ["Subject", "From"],
      });
      const h = msg.data.payload?.headers ?? [];
      const subj = h.find((x) => x.name === "Subject")?.value ?? "(no subject)";
      const from = h.find((x) => x.name === "From")?.value ?? "?";
      rows.push(`${m.id}  ${from} — ${subj}`);
    }
    return text(rows.join("\n") || "(no messages)");
  },
});

const getMessage = defineTool({
  name: "gmail_get",
  label: "Gmail: get",
  description: "Read a message's plain-text body by id.",
  parameters: Type.Object({ id: Type.String() }),
  execute: async (_id, params) => {
    const gmail = gmailClient();
    const msg = await gmail.users.messages.get({ userId: "me", id: params.id, format: "full" });
    return text(extractPlainText(msg.data));
  },
});

const sendMessage = defineTool({
  name: "gmail_send",
  label: "Gmail: send",
  description: "Send a plain-text email.",
  parameters: Type.Object({
    to: Type.String(),
    subject: Type.String(),
    body: Type.String(),
  }),
  execute: async (_id, params) => {
    const gmail = gmailClient();
    const raw = Buffer.from(
      [`To: ${params.to}`, `Subject: ${params.subject}`, "Content-Type: text/plain; charset=UTF-8", "", params.body].join(
        "\r\n",
      ),
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const res = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return text(`Sent (id ${res.data.id}).`);
  },
});

function extractPlainText(msg: gmail_v1.Schema$Message): string {
  const parts: gmail_v1.Schema$MessagePart[] = [];
  const walk = (p?: gmail_v1.Schema$MessagePart) => {
    if (!p) return;
    if (p.mimeType === "text/plain" && p.body?.data) parts.push(p);
    (p.parts ?? []).forEach(walk);
  };
  walk(msg.payload ?? undefined);
  if (parts.length === 0 && msg.payload?.body?.data) parts.push(msg.payload);
  const decoded = parts
    .map((p) => Buffer.from(p.body!.data!, "base64").toString("utf8"))
    .join("\n");
  return decoded || msg.snippet || "(empty)";
}

export const gmailConnector: Connector = {
  id: "gmail",
  name: "Gmail",
  description: "Read, search and send email via the Gmail API.",

  async status() {
    if (!hasClient()) return { status: "needs_auth", detail: "Set GOOGLE_OAUTH_CLIENT_ID/SECRET in .env" };
    if (!existsSync(PATHS.gmailToken)) {
      return { status: "needs_auth", detail: "Run `sigma connector login gmail`" };
    }
    try {
      const profile = await gmailClient().users.getProfile({ userId: "me" });
      return { status: "connected", detail: `Authorized as ${profile.data.emailAddress}` };
    } catch (err) {
      return { status: "error", detail: (err as Error).message };
    }
  },

  tools() {
    return [listMessages, getMessage, sendMessage];
  },

  login,
};
