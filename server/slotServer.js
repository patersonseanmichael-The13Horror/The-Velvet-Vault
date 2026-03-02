const admin = require("firebase-admin");
const cors = require("cors");
const express = require("express");
const rateLimit = require("express-rate-limit");
const { getSlotConfig } = require("../functions/slots-configs");
const { normalizeFeatureState, runSpin } = require("../functions/slots-engine-runtime");

function loadServiceAccountFromEnv() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON");
  }

  try {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch (error) {
    throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${error.message}`);
  }
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(loadServiceAccountFromEnv())
  });
}

const app = express();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const ROUND_TTL_MS = 10 * 60 * 1000;
const USER_RATE_WINDOW_MS = 15 * 1000;
const USER_RATE_MAX = 20;
const recentRounds = new Map();
const userRequestLog = new Map();
const spinLimiter = rateLimit({
  windowMs: 15 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req, res) {
    return sendError(res, 429, "Too many requests");
  }
});

function sendError(res, status, error) {
  return res.status(status).json({
    error
  });
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("CORS blocked"));
  },
  credentials: true
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "10kb" }));
app.use("/spin", spinLimiter);

function safeString(value, max = 120) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function parseInteger(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return null;
  }
  return value;
}

async function verifyUser(req) {
  const authHeader = String(req.headers.authorization || "");
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    throw new Error("missing token");
  }
  const decoded = await admin.auth().verifyIdToken(match[1]);
  if (!decoded?.uid) {
    throw new Error("invalid token");
  }
  return decoded;
}

async function requireAuth(req, res, next) {
  try {
    req.user = await verifyUser(req);
    return next();
  } catch {
    return sendError(res, 401, "Unauthorized");
  }
}

function rememberRound(uid, roundId) {
  let roundTimers = recentRounds.get(uid);
  if (!roundTimers) {
    roundTimers = new Map();
    recentRounds.set(uid, roundTimers);
  }

  const existingTimer = roundTimers.get(roundId);
  if (existingTimer) {
    return false;
  }

  const timeout = setTimeout(() => {
    const activeRounds = recentRounds.get(uid);
    if (!activeRounds) return;
    activeRounds.delete(roundId);
    if (activeRounds.size === 0) {
      recentRounds.delete(uid);
    }
  }, ROUND_TTL_MS);
  if (typeof timeout.unref === "function") {
    timeout.unref();
  }
  roundTimers.set(roundId, timeout);
  return true;
}

function isRateLimitedForUser(uid) {
  const now = Date.now();
  const active = (userRequestLog.get(uid) || []).filter((ts) => now - ts < USER_RATE_WINDOW_MS);
  if (active.length >= USER_RATE_MAX) {
    userRequestLog.set(uid, active);
    return true;
  }
  active.push(now);
  userRequestLog.set(uid, active);
  return false;
}

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok"
  });
});

app.post("/spin", requireAuth, async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return sendError(res, 400, "Invalid request body");
    }

    const requestedBetAmount = req.body.betAmount ?? req.body.stake ?? req.body.bet;
    if (typeof requestedBetAmount !== "number" || !Number.isFinite(requestedBetAmount)) {
      return sendError(res, 400, "Invalid bet amount");
    }

    const uid = String(req.user?.uid || "");
    if (!uid) {
      return sendError(res, 401, "Unauthorized");
    }

    const machineId = safeString(req.body?.machineId || req.body?.configId || "noir_paylines_5x3", 80);
    const roundId = safeString(req.body?.roundId || "", 120);
    const stake = parseInteger(requestedBetAmount);
    const denom = parseInteger(req.body?.denom ?? 1);
    const clientSeed = safeString(req.body?.clientSeed || "", 160);
    const featureState = normalizeFeatureState(req.body?.state || req.body?.featureState || null);

    if (!roundId) {
      return sendError(res, 400, "roundId required");
    }
    if (!Number.isInteger(stake) || stake < 1) {
      return sendError(res, 400, "stake must be a positive integer");
    }
    if (!Number.isInteger(denom) || denom < 1) {
      return sendError(res, 400, "denom must be a positive integer");
    }
    if (isRateLimitedForUser(uid)) {
      return sendError(res, 429, "Too many requests");
    }

    const config = getSlotConfig(machineId);
    if (!rememberRound(uid, roundId)) {
      return sendError(res, 409, "roundId already used");
    }
    const spin = runSpin(config, {
      bet: stake,
      denom,
      roundId,
      seed: clientSeed || `${uid}:${roundId}`,
      featureState
    });

    console.log(JSON.stringify({
      type: "slot_spin",
      uid,
      roundId,
      machineId: config.id,
      stake,
      totalWin: spin.result.totalWin
    }));

    res.json({
      ok: true,
      machineId: config.id,
      outcome: {
        ...spin.result,
        totalPayout: spin.result.totalWin
      },
      audit: spin.audit
    });
  } catch (error) {
    const message = String(error?.message || error || "slot server error");
    const status = /token|unauthorized/i.test(message) ? 401 : 500;
    return sendError(res, status, status === 500 ? "Internal server error" : message);
  }
});

app.use((err, _req, res, _next) => {
  console.error("Server error:", err);
  if (err?.message === "CORS blocked") {
    return sendError(res, 403, "CORS blocked");
  }
  return sendError(res, 500, "Internal server error");
});

module.exports = {
  app,
  verifyUser
};

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Slot server running on port ${PORT}`);
  });
}
