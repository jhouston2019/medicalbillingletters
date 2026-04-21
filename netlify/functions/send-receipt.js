/**
 * Optional receipt hook — extend to call SendGrid / Stripe receipt if needed.
 */
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
      body: JSON.stringify({ ok: false, error: "Method not allowed" }),
    };
  }

  return {
    statusCode: 200,
    headers: cors(),
    body: JSON.stringify({
      ok: true,
      message: "Receipt dispatch not configured; Stripe sends email receipts by default.",
    }),
  };
};
