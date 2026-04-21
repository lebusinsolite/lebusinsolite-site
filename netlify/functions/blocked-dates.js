const { createClient } = require('@supabase/supabase-js');

module.exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };

  const { from, to } = event.queryStringParameters || {};
  if (!from || !to) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'from et to requis' }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  const { data, error } = await supabase
    .from('blocked_dates')
    .select('date')
    .gte('date', from)
    .lte('date', to);

  if (error) return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ dates: data.map(r => r.date) }),
  };
};
