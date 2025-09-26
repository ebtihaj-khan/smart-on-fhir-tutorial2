# FH PA Dashboard - SMART on FHIR Application Documentation

## Overview
The FH PA Dashboard is a comprehensive SMART on FHIR application that displays patient data in a modern, user-friendly interface. It supports both FHIR R2 (DSTU2) and R4 versions and can be launched from various EHR systems including SMART Health IT sandbox and Cerner.

## Application Architecture

### Core Components
1. **Launch Handler** (`launch.html`) - Handles OAuth2 authorization flow
2. **Main Application** (`index.html`) - Displays patient data dashboard
3. **JavaScript Engine** (`src/js/example-smart-app.js`) - Core application logic
4. **Styling** (`src/css/example-smart-app.css`) - Modern, flat design

### FHIR Client Libraries
- **FHIR Client v0.1.12** - Core FHIR operations
- **Cerner Additions** - Cerner-specific extensions
- **SMART Embeddable Library** - UI components

## Launch Process from SMART Health IT

### 1. OAuth2 Authorization Flow

When launched from SMART Health IT, the application follows this sequence:

```javascript
// Launch URL: https://your-app.com/launch.html?iss=SMART_SANDBOX_URL&launch=LAUNCH_TOKEN

// OAuth configuration
const authConfig = {
    'client_id': '43ae576d-41fd-4e5e-a654-45c7d294f919',
    'scope': 'patient/Patient.read user/Patient.read system/Patient.read patient/MedicationRequest.read user/MedicationRequest.read system/MedicationRequest.read patient/MedicationDispense.read user/MedicationDispense.read system/MedicationDispense.read patient/MedicationAdministration.read user/MedicationAdministration.read system/MedicationAdministration.read patient/AllergyIntolerance.read user/AllergyIntolerance.read system/AllergyIntolerance.read patient/Condition.read user/Condition.read system/Condition.read patient/DocumentReference.read user/DocumentReference.read system/DocumentReference.read patient/Observation.read user/Observation.read system/Observation.read launch online_access openid profile fhirUser',
    'iss': iss,  // SMART Health IT sandbox URL
    'launch': launch  // Launch token from URL parameters
};
```

### 2. FHIR Client Initialization

The application initializes the FHIR client using:

```javascript
FHIR.oauth2.ready(onReady, onError);
```

This handles:
- OAuth2 token exchange
- Patient context establishment
- FHIR server connection

### 3. Data Extraction Process

Once the FHIR client is ready, the `extractData()` function:

#### A. Determines FHIR Version
```javascript
var fhirVersion = smart.state.serverUrl.includes('/r2/') ? 'R2' : 'R4';
```

#### B. Extracts Encounter Context (if available)
```javascript
function getEncounterIdFromContext(smart) {
    // Method 1: Direct method
    if (typeof smart.getEncounterId === 'function') {
        encounterId = smart.getEncounterId();
    }
    
    // Method 2: From token response
    if (!encounterId && smart.state?.tokenResponse?.encounter) {
        encounterId = smart.state.tokenResponse.encounter;
    }
    
    // Method 3: From patient context
    if (!encounterId && smart.patient && typeof smart.patient.getEncounterId === 'function') {
        encounterId = smart.patient.getEncounterId();
    }
    
    return encounterId;
}
```

#### C. Fetches Patient Data
```javascript
// Patient demographics
var pt = smart.patient.request({
    type: 'Patient',
    query: {}
});

// Observations (vitals, lab results, etc.)
var obv = smart.request({
    url: 'Observation',
    query: encounterId ? { encounter: encounterId, _count: 50 } : { _count: 50 }
});
```

#### D. Fetches Clinical Data with Version-Specific Resource Names

**For FHIR R2 (DSTU2):**
```javascript
var meds = smart.request({
    url: 'MedicationOrder',  // R2 uses MedicationOrder
    query: medQuery
});
```

**For FHIR R4:**
```javascript
var meds = smart.request({
    url: 'MedicationRequest',  // R4 uses MedicationRequest
    query: medQuery
});
```

### 4. Data Processing and Display

#### A. Bundle Processing
```javascript
function processBundle(bundle, type) {
    if (bundle && bundle.entry) {
        var resources = bundle.entry.map(function(entry) { return entry.resource; });
        return resources;
    } else if (Array.isArray(bundle)) {
        return bundle;
    } else {
        return [];
    }
}
```

#### B. Data Sorting
All lists are sorted by date (most recent first):
```javascript
function sortByDate(obs) {
    var sortedObs = obs.slice();
    return sortedObs.sort(function(a, b) {
        var dateA = new Date(a.effectiveDateTime || a.issued || a.meta?.lastUpdated || 0);
        var dateB = new Date(b.effectiveDateTime || b.issued || b.meta?.lastUpdated || 0);
        return dateB - dateA;
    });
}
```

#### C. Text Formatting
```javascript
function toSentenceCase(text) {
    if (!text || typeof text !== 'string') return text;
    var lower = text.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function formatStatus(status) {
    var statusMap = {
        'active': 'Active',
        'confirmed': 'Confirmed',
        'current': 'Current',
        // ... more mappings
    };
    return statusMap[status.toLowerCase()] || toSentenceCase(status);
}
```

## Data Display Sections

### 1. Patient Demographics
- **Name**: First and last name from Patient resource
- **Gender**: Formatted with sentence case
- **Birth Date**: From Patient.birthDate
- **Patient ID**: Displayed in header

### 2. Vitals & Observations
- **All Observations**: Comprehensive list of all observation types
- **Sorting**: By last updated date (most recent first)
- **Value Formatting**: Rounded to appropriate decimal places
- **Date Display**: Formatted as locale date string

### 3. Medications
- **Resource Handling**: MedicationOrder (R2) vs MedicationRequest (R4)
- **Display Fields**: Name, status, dosage, intent, priority, dates
- **Sorting**: By last updated date
- **Status Mapping**: Standardized status display

### 4. Allergies
- **Allergen Names**: Extracted from coding.display or coding.code
- **Severity**: Criticality (R4) or severity (R2)
- **Status**: Active, inactive, etc.
- **Additional Info**: Category, type, reaction, dates

### 5. Conditions
- **Condition Names**: Prioritized from code.text, then coding.display
- **Clinical Status**: Active, resolved, etc.
- **Verification Status**: Confirmed, refuted, etc.
- **Sorting**: By onset date (most recent first)

### 6. Clinical Documents
- **Document Types**: From type.coding.display
- **Status**: Current, superseded, etc.
- **Metadata**: Date, author, format, size
- **Sorting**: By last updated date

## Encounter-Based Filtering

### Implementation
When an encounter ID is available, all FHIR queries include the encounter parameter:

```javascript
var queryParams = encounterId ? { encounter: encounterId, _count: 50 } : { _count: 50 };
```

### Debug Logging
The application includes comprehensive logging to verify encounter filtering:

```javascript
if (encounterId && observations.length > 0) {
    console.log('=== ENCOUNTER FILTERING DEBUG ===');
    console.log('Total observations returned:', observations.length);
    console.log('Looking for observations with encounter:', encounterId);
    
    var encounterFilteredObs = observations.filter(function(obs) {
        return obs.context && obs.context.reference && 
               obs.context.reference.includes(encounterId);
    });
    
    console.log('Observations actually linked to encounter:', encounterFilteredObs.length);
}
```

### SMART Health IT Limitation
**Note**: The SMART Health IT test sandbox may not support encounter-based filtering, so all patient data is returned regardless of encounter context. This is expected behavior for the test environment.

## Error Handling

### Promise Management
```javascript
Promise.allSettled([pt, obv, meds, allergies, conditions, documents]).then(function(results) {
    // Handle each result individually
    results.forEach(function(result, index) {
        if (result.status === 'rejected') {
            console.log('Failed to fetch resource:', result.reason);
        }
    });
});
```

### Graceful Degradation
- Missing data shows "No data available" messages
- Failed requests don't break the entire application
- Fallback values for missing fields

## Browser Compatibility

### Required Libraries
- **jQuery**: DOM manipulation and AJAX
- **FHIR Client**: FHIR operations
- **Font Awesome**: Icons

### Modern Features
- CSS Grid and Flexbox for layout
- ES6+ JavaScript features
- Responsive design

## Security Considerations

### OAuth2 Scopes
The application requests minimal necessary scopes:
- `patient/*.read` - Read patient data
- `user/*.read` - Read user data (if applicable)
- `launch` - Launch context
- `openid`, `profile` - User identification
- `fhirUser` - FHIR user context

### Data Handling
- No data is stored locally
- All data is fetched fresh on each launch
- Patient context is maintained by the FHIR client

## Deployment

### Local Development
```bash
python3 -m http.server 443
# Access at http://localhost:443
```

### Production Deployment
- **Vercel**: Automatic deployment from GitHub
- **GitHub Pages**: Static hosting
- **CORS**: Handled by deployment platform

## Testing

### SMART Health IT Sandbox
1. Visit: https://launch.smarthealthit.org/
2. Select FHIR version (R2 or R4)
3. Choose patient
4. Launch with your app URL

### Expected Behavior
- **R2**: Uses MedicationOrder, different data structures
- **R4**: Uses MedicationRequest, modern FHIR structures
- **Encounter Filtering**: May not work in test sandbox
- **Data Display**: All sections populated with available data

## Troubleshooting

### Common Issues
1. **CORS Errors**: Use deployed version, not localhost
2. **403 Forbidden**: Check OAuth scopes in EHR system
3. **Empty Data**: Verify patient has data in test system
4. **Version Errors**: Ensure correct FHIR version selection

### Debug Information
Check browser console for:
- OAuth token details
- FHIR query parameters
- Bundle contents
- Encounter filtering status

## Future Enhancements

### Planned Features
- Real-time data updates
- Advanced filtering options
- Export functionality
- Mobile optimization
- Additional FHIR resources

### Integration Opportunities
- Cerner PowerChart
- Epic MyChart
- Other EHR systems
- Clinical decision support tools

---

*This documentation covers the current implementation as of the latest commit. For technical support or feature requests, please refer to the project repository.*
