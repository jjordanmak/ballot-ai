import { describe, expect, it } from "vitest";
import { jobRequest } from "./remote";

const deploymentUrl = "https://ballot-abc123-team.vercel.app/api/cron/research";

describe("jobRequest", () => {
  it("production: sends jobs to the production domain, not the protected deployment URL", () => {
    const r = jobRequest(deploymentUrl, "measure:m1:measure@claude-haiku-5-5:low", "Bearer x", { VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "ballot-ai.vercel.app" });
    expect(r.url).toBe("https://ballot-ai.vercel.app/api/cron/research?job=measure%3Am1%3Ameasure%40claude-haiku-5-5%3Alow");
    expect(r.headers).toEqual({ authorization: "Bearer x" });
  });

  it("elsewhere: the request's origin, with the automation bypass when set", () => {
    const r = jobRequest(deploymentUrl, "k", "Bearer x", { VERCEL_ENV: "preview", VERCEL_AUTOMATION_BYPASS_SECRET: "s" });
    expect(r.url).toBe("https://ballot-abc123-team.vercel.app/api/cron/research?job=k");
    expect(r.headers["x-vercel-protection-bypass"]).toBe("s");
    expect(jobRequest("http://localhost:3000/api/cron/research", "k", "", {}).url).toBe("http://localhost:3000/api/cron/research?job=k");
  });
});
