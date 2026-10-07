import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ signedIn: true, access: true, planner: true, drafter: true, configured: true,
  rpc: vi.fn(), audit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/session", () => ({ getServerUser: async () => ({ user: state.signedIn ? {id: "user"} : null }) }));
vi.mock("@/lib/access/client-access", () => ({ canAccessClient: async () => state.access,
  canManageIdeas: async () => state.planner, canDraftPosts: async () => state.drafter }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: state.rpc }) }));
vi.mock("@/lib/audit/log", () => ({ writeAuditLog: state.audit }));
vi.mock("@/lib/openrouter/client", () => ({ getOpenRouterConfig: () => state.configured ? { model: "configured" } : null }));
import { startCalendarDraftBatch, cancelCalendarDraftBatch } from "@/features/calendar/drafting-service";

const clientId = "1747d905-1b0b-4054-9670-874850a5ff29";
const calendarId = "1747d905-1b0b-4054-9670-874850a5ff30";
const input = { requestKey: calendarId, slots: [{ slotId: clientId, brief: { topic: "A supplied topic" } }] };
beforeEach(() => {
  Object.assign(state, {signedIn:true,access:true,planner:true,drafter:true,configured:true});
  state.rpc.mockReset().mockResolvedValue({data:{ok:true,job_id:calendarId},error:null}); state.audit.mockReset();
  vi.stubEnv("CALENDAR_DRAFTING_ENABLED","true");
});
afterEach(() => vi.unstubAllEnvs());
describe("calendar drafting service gates", () => {
  it.each(["signedIn","access","planner","drafter"] as const)("denies work without %s before any database mutation", async key => {
    state[key]=false; const result = await startCalendarDraftBatch(clientId,calendarId,input);
    expect(result.ok).toBe(false); expect(state.rpc).not.toHaveBeenCalled();
  });
  it("defaults off and requires a configured provider", async () => {
    vi.stubEnv("CALENDAR_DRAFTING_ENABLED","");
    expect((await startCalendarDraftBatch(clientId,calendarId,input)).ok).toBe(false);
    vi.stubEnv("CALENDAR_DRAFTING_ENABLED","true"); state.configured=false;
    const result=await startCalendarDraftBatch(clientId,calendarId,input);
    expect(!result.ok && result.code).toBe("NOT_CONFIGURED"); expect(state.rpc).not.toHaveBeenCalled();
  });
  it("saves validated briefs with a caller-stable request key and metadata-only audit", async () => {
    expect((await startCalendarDraftBatch(clientId,calendarId,input)).ok).toBe(true);
    expect(state.rpc).toHaveBeenCalledWith("start_calendar_draft_job",expect.objectContaining({
      p_request_key: input.requestKey, p_slots:[{slot_id:clientId,brief:{topic:"A supplied topic",postType:"framework",funnelStage:"Depth",contentPillar:"",intendedReader:"",primaryTakeaway:""}}],
    }));
    expect(state.audit.mock.calls[0][0].metadata).toEqual({slot_count:1});
  });
  it("allows authorized cancellation while the feature is disabled", async () => {
    vi.stubEnv("CALENDAR_DRAFTING_ENABLED","false");
    expect((await cancelCalendarDraftBatch(clientId,calendarId)).ok).toBe(true);
    expect(state.rpc).toHaveBeenCalledWith("cancel_calendar_draft_job",{p_client_id:clientId,p_job_id:calendarId});
  });
  it("does not report a rejected/failed RPC as a successful request", async () => {
    state.rpc.mockResolvedValue({data:{ok:false,code:"BATCH_ACTIVE"},error:null});
    const result=await startCalendarDraftBatch(clientId,calendarId,input);
    expect(!result.ok && result.code).toBe("BATCH_ACTIVE"); expect(state.audit).not.toHaveBeenCalled();
  });
});
