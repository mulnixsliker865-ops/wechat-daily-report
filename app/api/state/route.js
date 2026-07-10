import { getState, mergeState } from "../../../lib/feishuStore.js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await getState();
    return Response.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(request) {
  try {
    const nextState = await request.json();
    const state = await mergeState(nextState);
    return Response.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}
