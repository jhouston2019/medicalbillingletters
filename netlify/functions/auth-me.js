const { extractToken, verifyToken } = require("./_middleware/auth");

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

  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: cors(),
      body: JSON.stringify({ user: null, error: "Method not allowed" }),
    };
  }

  const token = extractToken(event);
  const user = await verifyToken(token);

  if (!user) {
    return {
      statusCode: 401,
      headers: cors(),
      body: JSON.stringify({ user: null, error: "Unauthorized" }),
    };
  }

  return {
    statusCode: 200,
    headers: cors(),
    body: JSON.stringify({
      user: {
        id: user.id,
        email: user.email,
      },
    }),
  };
};
