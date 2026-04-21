/**
 * Recovery helper: no entitlement writes. Directs user to login / pricing / app based on JWT snapshot only.
 */

const { extractToken, verifyToken } = require("./_middleware/auth");
const { getBillingSnapshot } = require("./_billingSnapshot");

function cors() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(), body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: cors(),
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const token = extractToken(event);
    const user = token ? await verifyToken(token) : null;

    if (user) {
      const snap = await getBillingSnapshot(user.id);
      if (snap.paid === true) {
        return {
          statusCode: 200,
          headers: cors(),
          body: JSON.stringify({ state: "paid", next: "/app" }),
        };
      }
    }

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({ state: "none", next: "/pricing" }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({ state: "none", next: "/pricing" }),
    };
  }
};
