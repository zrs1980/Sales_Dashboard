const OWNER_ID = '159716972'; // Ryan McQuillan
const LOOP_PIPELINE = 'default'; // Loop ERP pipeline ID
const CEBA_PIPELINE = '96753255'; // CEBA pipeline ID

// Stage ID → label map (HubSpot internal IDs)
const STAGE_LABELS = {
  'appointmentscheduled': 'New Deal',
  'qualifiedtobuy': 'Req. Analysis',
  'presentationscheduled': 'Demo Booked',
  'decisionmakerboughtin': 'Demo Complete',
  'contractsent': "Add'l Education",
  'closedwon': 'Closed Won',
  'closedlost': 'Closed Lost',
};

async function hubspotFetch(token, path, body) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HubSpot API error ${res.status}: ${err}`);
  }
  return res.json();
}

export default async function handler(req, res) {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'HUBSPOT_TOKEN not configured' });
  }

  // Allow CORS for same-origin Vercel deployment
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');

  try {
    // ── 1. Fetch all open deals (both pipelines) ──────────────────────────
    const dealsBody = {
      filterGroups: [{
        filters: [
          { propertyName: 'hs_is_closed', operator: 'EQ', value: 'false' },
          { propertyName: 'hubspot_owner_id', operator: 'EQ', value: OWNER_ID },
        ],
      }],
      properties: [
        'dealname', 'dealstage', 'amount', 'closedate', 'pipeline',
        'hs_deal_stage_probability', 'notes_last_contacted',
        'num_notes', 'hs_date_entered_appointmentscheduled',
        'hs_date_entered_qualifiedtobuy', 'hs_date_entered_presentationscheduled',
        'hs_date_entered_decisionmakerboughtin', 'hs_date_entered_contractsent',
      ],
      sorts: [{ propertyName: 'closedate', direction: 'ASCENDING' }],
      limit: 100,
    };
    const dealsData = await hubspotFetch(token, '/crm/v3/objects/deals/search', dealsBody);

    // ── 2. Fetch closed deals for CEBA historical ─────────────────────────
    const closedBody = {
      filterGroups: [
        { filters: [
          { propertyName: 'hs_is_closed_won', operator: 'EQ', value: 'true' },
          { propertyName: 'hubspot_owner_id', operator: 'EQ', value: OWNER_ID },
          { propertyName: 'pipeline', operator: 'EQ', value: CEBA_PIPELINE },
        ]},
        { filters: [
          { propertyName: 'hs_is_closed', operator: 'EQ', value: 'true' },
          { propertyName: 'hs_is_closed_won', operator: 'EQ', value: 'false' },
          { propertyName: 'hubspot_owner_id', operator: 'EQ', value: OWNER_ID },
          { propertyName: 'pipeline', operator: 'EQ', value: CEBA_PIPELINE },
        ]},
      ],
      properties: ['dealname', 'dealstage', 'amount', 'closedate', 'pipeline'],
      sorts: [{ propertyName: 'closedate', direction: 'DESCENDING' }],
      limit: 50,
    };
    const closedData = await hubspotFetch(token, '/crm/v3/objects/deals/search', closedBody);

    // ── 3. Fetch leads (lifecyclestage = lead) ────────────────────────────
    const leadsBody = {
      filterGroups: [{
        filters: [
          { propertyName: 'lifecyclestage', operator: 'EQ', value: 'lead' },
          { propertyName: 'hubspot_owner_id', operator: 'EQ', value: OWNER_ID },
        ],
      }],
      properties: [
        'firstname', 'lastname', 'company', 'hs_lead_status',
        'num_contacted_notes', 'notes_last_contacted', 'createdate',
      ],
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
      limit: 200,
    };
    const leadsData = await hubspotFetch(token, '/crm/v3/objects/contacts/search', leadsBody);

    // ── 4. Fetch SDR call activities (owner: Caleb Wilton = 161027134) ───
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1);
    monday.setHours(0, 0, 0, 0);

    const callsBody = {
      filterGroups: [{
        filters: [
          { propertyName: 'hs_activity_type', operator: 'EQ', value: 'CALL' },
          { propertyName: 'hubspot_owner_id', operator: 'EQ', value: '161027134' },
          { propertyName: 'hs_timestamp', operator: 'GTE', value: String(monday.getTime()) },
        ],
      }],
      properties: ['hs_timestamp', 'hs_call_disposition', 'hs_activity_type'],
      sorts: [{ propertyName: 'hs_timestamp', direction: 'DESCENDING' }],
      limit: 200,
    };
    let callsData = { results: [], total: 0 };
    try {
      callsData = await hubspotFetch(token, '/crm/v3/objects/calls/search', callsBody);
    } catch (e) {
      // calls endpoint may need extra scope — gracefully degrade
      console.warn('Calls fetch failed:', e.message);
    }

    // ── Map & return clean payload ────────────────────────────────────────
    const openDeals = dealsData.results.map(d => ({
      id: d.id,
      name: d.properties.dealname,
      stage: STAGE_LABELS[d.properties.dealstage] || d.properties.dealstage,
      stageId: d.properties.dealstage,
      pipeline: d.properties.pipeline,
      amount: parseFloat(d.properties.amount || 0),
      probability: parseFloat(d.properties.hs_deal_stage_probability || 0),
      closeDate: d.properties.closedate,
      lastContact: d.properties.notes_last_contacted,
      numNotes: parseInt(d.properties.num_notes || 0),
    }));

    const closedDeals = closedData.results.map(d => ({
      id: d.id,
      name: d.properties.dealname,
      stage: STAGE_LABELS[d.properties.dealstage] || d.properties.dealstage,
      amount: parseFloat(d.properties.amount || 0),
      closeDate: d.properties.closedate,
      isWon: d.properties.dealstage === 'closedwon',
    }));

    const leads = leadsData.results.map(l => {
      const first = l.properties.firstname || '';
      const last = l.properties.lastname || '';
      const name = (first + ' ' + last).trim() || l.properties.email || 'Unknown';
      return {
        id: l.id,
        name,
        company: l.properties.company || '',
        status: l.properties.hs_lead_status || 'NEW',
        touches: parseInt(l.properties.num_contacted_notes || 0),
        lastContact: l.properties.notes_last_contacted
          ? l.properties.notes_last_contacted.slice(0, 10)
          : null,
        created: l.properties.createdate
          ? l.properties.createdate.slice(0, 10)
          : null,
      };
    });

    // Group calls by day for SDR chart
    const callsByDay = {};
    callsData.results.forEach(c => {
      const d = new Date(parseInt(c.properties.hs_timestamp)).toISOString().slice(0, 10);
      callsByDay[d] = (callsByDay[d] || 0) + 1;
    });

    res.status(200).json({
      openDeals,
      closedDeals,
      leads,
      callsByDay,
      leadsTotal: leadsData.total,
      fetchedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error('Dashboard API error:', err);
    res.status(500).json({ error: err.message });
  }
}
