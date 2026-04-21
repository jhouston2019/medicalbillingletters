const { extractToken, verifyToken } = require("./_middleware/auth");
const { getBillingSnapshot } = require("./_billingSnapshot");
const { isPaymentBypassEnabled } = require("./payment-enforcer");

function cors() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(), body: "" };
  }

  const token = extractToken(event);
  const user = await verifyToken(token);

  if (!user) {
    return {
      statusCode: 401,
      headers: cors(),
      body: JSON.stringify({ error: "Unauthorized" }),
    };
  }

  if (isPaymentBypassEnabled()) {
    const snapshot = await getBillingSnapshot(user.id);
    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({
        ...snapshot,
        bypass: true,
        paid: true,
        active: true,
      }),
    };
  }

  const snapshot = await getBillingSnapshot(user.id);
  return {
    statusCode: 200,
    headers: cors(),
    body: JSON.stringify(snapshot),
  };
};
