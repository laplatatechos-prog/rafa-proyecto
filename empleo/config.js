window.SB = {
  url: 'https://dowtczgckcuvxwpgqcpq.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvd3Rjemdja2N1dnh3cGdxY3BxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNzM1MjIsImV4cCI6MjEwODg0OTUyMn0.zN23LvcbY2BlMxe-kqp0MV8nucmY2bKV1foeqd6Vx8E'
};
window.rpc = function (fn, body) {
  return fetch(SB.url + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SB.key, Authorization: 'Bearer ' + SB.key },
    body: JSON.stringify(body)
  }).then(function (r) {
    return r.json().catch(function () { return null; }).then(function (j) {
      if (!r.ok) throw new Error((j && j.message) || ('Error ' + r.status));
      return j;
    });
  });
};
