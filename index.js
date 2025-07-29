const fetch = require('node-fetch');

const API_KEY = 'ak_9ab1c365fa7a0fbf97bfe8cf6e5a0ab15a2789ba7e7d7550'; 
const BASE_URL = 'https://assessment.ksensetech.com/api';

async function fetchAllPatients() {
  let allPatients = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${BASE_URL}/patients?page=${page}&limit=5`;

    try {
      const response = await fetch(url, {
        headers: { 'x-api-key': API_KEY },
      });

      if (response.status === 429) {
        console.warn("Rate limited. Waiting...");
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      const data = await response.json();
      if (!data.data || data.data.length === 0) hasMore = false;
      else {
        allPatients.push(...data.data);
        page++;
      }
    } catch (err) {
      console.error(`Failed to fetch page ${page}:`, err);
      break;
    }
  }

  return allPatients;
}

function calculateRiskScore(patient) {
  let score = 0;
  let issueCount = 0;

  const bad = ['TEMP_ERROR', 'ERROR', '', null, undefined, 'unknown', 'Invalid'];

  // Age
  const rawAge = patient.age?.toString().trim();
  const age = parseInt(rawAge);
  if (isNaN(age) || bad.includes(rawAge)) issueCount++;
  else if (age >= 40 && age <= 65) score += 1;
  else if (age > 65) score += 2;

  // Temperature
  const rawTemp = patient.temperature?.toString().trim();
  const temp = parseFloat(rawTemp);
  if (isNaN(temp) || bad.includes(rawTemp)) issueCount++;
  else if (temp >= 101.0) score += 2;
  else if (temp >= 99.6) score += 1;

  // Blood Pressure
  const rawSys = patient.systolic?.toString().trim();
  const rawDia = patient.diastolic?.toString().trim();
  const sys = parseInt(rawSys);
  const dia = parseInt(rawDia);

  if ((isNaN(sys) && isNaN(dia)) || (bad.includes(rawSys) && bad.includes(rawDia))) {
    issueCount++;
  } else {
    if (sys >= 140 || dia >= 90) score += 3;
    else if (sys >= 130 || dia >= 80) score += 2;
    else if (sys >= 120 || dia >= 80) score += 1;
  }

  const hasIssue = issueCount >= 2;

  return { score, hasIssue, temp };
}

function processPatients(patients) {
  const highRisk = [];
  const fever = [];
  const issues = [];

  patients.forEach(patient => {
    const { score, hasIssue, temp } = calculateRiskScore(patient);

    console.log(`${patient.patient_id} → Score: ${score} | Temp: ${patient.temperature} | Issue: ${hasIssue}`);

    if (score >= 4) highRisk.push(patient.patient_id);
    if (!isNaN(temp) && temp >= 99.6) fever.push(patient.patient_id);
    if (hasIssue) issues.push(patient.patient_id);
  });

  return { highRisk, fever, issues };
}

async function submitResults(result) {
  try {
    const response = await fetch(`${BASE_URL}/submit-assessment`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result),
    });

    const data = await response.json();
    console.log("📤 Submission Response:", data);
  } catch (err) {
    console.error("❌ Submission failed:", err);
  }
}

(async () => {
  const patients = await fetchAllPatients();
  console.log(`✅ Fetched ${patients.length} patients`);

  const { highRisk, fever, issues } = processPatients(patients);

  console.log("🔴 High Risk Patients:", highRisk);
  console.log("🌡️ Fever Patients:", fever);
  console.log("⚠️ Data Quality Issues:", issues);

  
  await submitResults({
    high_risk_patients: highRisk,
    fever_patients: fever,
    data_quality_issues: issues
  });
  
})();
