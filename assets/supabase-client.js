(function () {
  const supabaseApi = window.supabase;
  const config = {
    url: "https://tqbxmeacyoxsqfjhuqar.supabase.co",
    publishableKey: "sb_publishable_x5Twg8FgU2M9C4KMG_uniw_bDmxAP77"
  };

  if (!supabaseApi || typeof supabaseApi.createClient !== "function") {
    throw new Error("Supabase JS did not load. Check the network connection and CDN access.");
  }

  window.verdelleSupabase = supabaseApi.createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true
    }
  });
})();
