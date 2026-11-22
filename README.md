# Gallery Route

Plan a round trip through a fictional design museum. The route calculation accounts for walking, time at each exhibit, and the return to the entrance. It respects quiet and step-free constraints and names requested exhibits that could not fit.

## Local run

From the parent workspace, run:

```sh
node agentic-web-reference/skills/agentify-website/scripts/serve_site.mjs gallery-route --port 5181
node --test gallery-route/route.test.mjs
```

Open `http://127.0.0.1:5181/`. Set 45 minutes, choose Quiet and Step-free, and prefer Textile Archive and Sound Lab. The plan should visit Paper Works and Textile Archive in 45 minutes, returning to the Entrance. Sound Lab should be listed as outside the itinerary. With 10 minutes the form should report that no exhibit fits.

The chat uses the browser runtime and calls the same route calculator through the read-only `website_plan_visit` tool. A supported, CORS-enabled inference provider is required for the current chat prototype. The manual form works without provider configuration. The museum and exhibit details are synthetic.

## Local model verification

To verify real inference without a cloud account, use [llama.cpp](https://github.com/ggml-org/llama.cpp) and the official [Qwen3-4B GGUF](https://huggingface.co/Qwen/Qwen3-4B-GGUF). Keep these dependencies outside the site directory. From the parent workspace, start a local-only model server and run the integration check:

```sh
llama-server --model /path/to/Qwen3-4B-Q4_K_M.gguf --alias Qwen3-4B --host 127.0.0.1 --port 5184 --ctx-size 4096 --reasoning-budget 0
node gallery-route/verify-inference.mjs
```

The check uses the reference engine and published agent definitions. It requires a real model response and a validated route-tool receipt that preserves the requested constraints. The loopback server is for development verification. Browser hosting and public inference need separate verification.

## Publication

Serve the directory over HTTPS. Apply CORS to the public agent manifest and network JSON. Preserve the browser runtime's worker policy when moving from the reference local server to production hosting. Verify the public endpoint and chat from a clean browser before recording the demo.

The [reference deployment](https://leejinming.github.io/gallery-route/) publishes the [manifest](https://leejinming.github.io/gallery-route/agent-manifest.json) and [resolved network](https://leejinming.github.io/gallery-route/gallery-route.network.json) on GitHub Pages. This static deployment uses its own read-only route action and a closed peer policy.

The browser runtime comes from Cognizant AI Lab's [agentic-web reference repository](https://github.com/cognizant-ai-labs/agentic-web/tree/e34299792cb85f6eb27fed896fdedf65880b458b/skills/agentify-website/runtime). Gallery Route adds a final-answer callback in the runtime so the chat presents the verified itinerary from the current turn's tool receipt. Its license ships in `runtime/LICENSE.txt` and the upstream repository license is in `UPSTREAM-LICENSE.txt`.
