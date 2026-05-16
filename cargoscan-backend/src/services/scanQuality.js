const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const localQualityCheck = ({ dimensions = {}, metrics = {} }) => {
  const flags = [];
  const confidence = Number(dimensions.confidence ?? 0);
  const edgeAgreement = Number(metrics.edgeAgreement ?? 0);
  const stableFrameCount = Number(metrics.stableFrameCount ?? 0);
  const distanceMetres = Number(metrics.distanceMetres ?? 0);
  const pitchDegrees = Number(metrics.pitchDegrees ?? 0);
  const lidarPointCount = Number(metrics.lidarPointCount ?? 0);

  let score = confidence * 0.45;

  if (edgeAgreement >= 0.75) score += 0.2;
  else flags.push("LOW_EDGE_AGREEMENT");

  if (stableFrameCount >= 10) score += 0.15;
  else flags.push("LOW_STABLE_FRAMES");

  if (distanceMetres >= 0.55 && distanceMetres <= 3.5) score += 0.08;
  else flags.push("BAD_DISTANCE");

  if (pitchDegrees <= -20 && pitchDegrees >= -68) score += 0.08;
  else flags.push("BAD_ANGLE");

  if (lidarPointCount >= 250) score += 0.04;
  else flags.push("LOW_LIDAR_POINTS");

  score = clamp(score, 0, 0.99);

  const status = score >= 0.9
    ? "PASS"
    : score >= 0.75
      ? "REVIEW"
      : "RESCAN";

  return {
    status,
    score,
    reason: status === "PASS"
      ? "Local scan gates passed with stable LiDAR and camera geometry."
      : "Local scan gates found possible accuracy risk.",
    flags,
    guidance: flags.includes("BAD_DISTANCE")
      ? "Move to 0.6-3.5m from the cargo."
      : flags.includes("BAD_ANGLE")
        ? "Tilt the camera toward the top face of the cargo."
        : flags.includes("LOW_STABLE_FRAMES")
          ? "Hold still until the capture completes."
          : flags.includes("LOW_EDGE_AGREEMENT")
            ? "Center the cargo so all visible edges fit in frame."
            : "Scan quality is acceptable.",
    source: "LOCAL_HEURISTIC",
  };
};

const extractJson = (text) => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  }
};

const openAiQualityCheck = async ({ imageBase64, imageUrl, dimensions, metrics }) => {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const imageInput = imageBase64
    ? { type: "input_image", image_url: `data:image/jpeg;base64,${imageBase64}` }
    : imageUrl
      ? { type: "input_image", image_url: imageUrl }
      : null;

  if (!imageInput) return null;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_SCAN_QUALITY_MODEL || "gpt-5-mini",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You inspect warehouse cargo scan evidence. You do not measure dimensions yourself. Judge whether the visible cargo, LiDAR dimensions, and scan metadata are good enough for automatic CBM capture. Return only compact JSON.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                task: "Quality check this cargo scan for measurement reliability.",
                dimensions,
                metrics,
                expectedOutput: {
                  status: "PASS | REVIEW | RESCAN",
                  score: "0 to 1",
                  reason: "short operator-readable reason",
                  flags: ["OCCLUDED", "BAD_ANGLE", "MULTIPLE_OBJECTS", "LOW_EDGE_VISIBILITY", "BAD_DISTANCE"],
                  guidance: "short instruction for the camera screen",
                },
              }),
            },
            imageInput,
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "scan_quality_result",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              status: { type: "string", enum: ["PASS", "REVIEW", "RESCAN"] },
              score: { type: "number" },
              reason: { type: "string" },
              flags: {
                type: "array",
                items: { type: "string" },
              },
              guidance: { type: "string" },
            },
            required: ["status", "score", "reason", "flags", "guidance"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI quality check failed: ${response.status} ${body}`);
  }

  const json = await response.json();
  const outputText = json.output_text
    || json.output?.flatMap(item => item.content || [])
      .map(content => content.text)
      .filter(Boolean)
      .join("\n");
  const parsed = extractJson(outputText);
  if (!parsed) throw new Error("OpenAI quality check returned invalid JSON");

  return {
    status: ["PASS", "REVIEW", "RESCAN"].includes(parsed.status) ? parsed.status : "REVIEW",
    score: clamp(Number(parsed.score ?? 0), 0, 1),
    reason: String(parsed.reason || "AI quality check completed."),
    flags: Array.isArray(parsed.flags) ? parsed.flags.map(String) : [],
    guidance: String(parsed.guidance || "Retake if the cargo is not fully visible."),
    source: "OPENAI",
  };
};

const checkScanQuality = async (payload) => {
  const local = localQualityCheck(payload);

  try {
    const ai = await openAiQualityCheck(payload);
    if (!ai) return local;

    const score = clamp((local.score * 0.45) + (ai.score * 0.55), 0, 1);
    const status = score >= 0.9 ? "PASS" : score >= 0.75 ? "REVIEW" : "RESCAN";

    return {
      status,
      score,
      reason: ai.reason,
      flags: [...new Set([...(local.flags || []), ...(ai.flags || [])])],
      guidance: ai.guidance || local.guidance,
      source: "OPENAI_WITH_LOCAL_GATES",
    };
  } catch (err) {
    console.error("[ScanQuality] AI check failed:", err.message);
    return {
      ...local,
      flags: [...local.flags, "AI_CHECK_FAILED"],
    };
  }
};

module.exports = { checkScanQuality, localQualityCheck };
