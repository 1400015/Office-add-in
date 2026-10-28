import { handleProxy, type ProxyEnv } from "../src/proxy/forward";

export default {
  fetch: (request: Request, env: ProxyEnv) => handleProxy(request, env),
};
