export async function GET() {
  return Response.json({
    status: "ok",
    app: "CodeKidVai",
    timestamp: new Date().toISOString(),
  });
}
