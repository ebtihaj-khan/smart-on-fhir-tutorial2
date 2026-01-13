# Writing Encounters to Cerner EHR - Guide

## Overview

This application now supports **writing Encounter resources** back to Cerner EHR using the FHIR R4 API. This allows you to create new encounters directly from the SMART on FHIR application.

## Prerequisites

1. **OAuth Scopes**: Your application must be registered with write permissions for Encounter resources in Cerner's Code Console
2. **FHIR R4 API**: Cerner's FHIR R4 API must support Encounter write operations (this is available in most Cerner implementations)
3. **Authorization**: The user must have appropriate permissions in the EHR to create encounters

## Setup

### 1. Register Write Scopes in Cerner Code Console

When registering your application in Cerner's Code Console, ensure you request the following scopes:

- `patient/Encounter.read` - Read patient encounters
- `patient/Encounter.write` - Write patient encounters
- `user/Encounter.write` - Write encounters as the authenticated user

### 2. OAuth Configuration

The launch files (`launch.html`, `launch-patient.html`, `launch-smart-sandbox.html`) have been updated to include write scopes:

```javascript
'scope': '... patient/Encounter.read patient/Encounter.write user/Encounter.write'
```

## Usage

### Using the UI

1. Launch the application from Cerner EHR
2. Scroll to the "Create New Encounter" section
3. Fill in the encounter details:
   - **Status**: planned, arrived, in-progress, finished, or cancelled
   - **Class**: AMB (Ambulatory), EMER (Emergency), IMP (Inpatient), etc.
   - **Type**: Encounter type code (optional)
   - **Reason Code**: Reason for the encounter (optional)
   - **Start/End Date**: Date and time for the encounter (optional)
4. Click "Create Encounter"
5. The system will display success or error messages

### Using the JavaScript API

You can also create encounters programmatically using the `createEncounter()` function:

```javascript
// Example: Create a new ambulatory encounter
var encounterData = {
  status: 'in-progress',
  class: 'AMB',
  type: 'AMB',
  reasonCode: 'routine',
  startDate: new Date().toISOString()
};

window.createEncounter(encounterData)
  .then(function(response) {
    console.log('Encounter created:', response);
    console.log('Encounter ID:', response.id || response.resource?.id);
  })
  .catch(function(error) {
    console.error('Error creating encounter:', error);
  });
```

### Encounter Data Structure

The `createEncounter()` function accepts an object with the following properties:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `status` | string | Yes | Encounter status: `planned`, `arrived`, `in-progress`, `finished`, `cancelled` |
| `class` | string | Yes | Encounter class code: `AMB`, `EMER`, `IMP`, `OBSENC`, `PRENC`, `SS`, `VR` |
| `type` | string | No | Encounter type code (defaults to class if not provided) |
| `typeDisplay` | string | No | Display name for the type |
| `reasonCode` | string | No | Reason code for the encounter |
| `reasonDisplay` | string | No | Display name for the reason |
| `startDate` | string | No | Start date/time in ISO 8601 format |
| `endDate` | string | No | End date/time in ISO 8601 format |
| `location` | string | No | Location reference (e.g., `Location/123`) |

### Encounter Class Codes

| Code | Description |
|------|-------------|
| `AMB` | Ambulatory |
| `EMER` | Emergency |
| `IMP` | Inpatient encounter |
| `OBSENC` | Observation encounter |
| `PRENC` | Pre-admission |
| `SS` | Short stay |
| `VR` | Virtual |

## Cerner-Specific Requirements

### Required Fields

Cerner may require additional fields beyond the FHIR specification. Common requirements include:

1. **Subject Reference**: Automatically set to the current patient
2. **Status**: Must be a valid encounter status
3. **Class**: Must use standard HL7 v3 ActCode values
4. **Type**: Should use appropriate coding systems (CPT, SNOMED, etc.)

### Validation

Before creating an encounter, Cerner will validate:
- Patient context (must match authenticated patient)
- Required fields are present
- Coding systems and values are valid
- User has appropriate permissions

### Error Handling

Common errors you may encounter:

1. **403 Forbidden**: User doesn't have write permissions
   - Solution: Check OAuth scopes and user permissions in Cerner

2. **400 Bad Request**: Invalid encounter data
   - Solution: Check required fields and data format

3. **422 Unprocessable Entity**: Business rule violation
   - Solution: Review Cerner's encounter creation rules

4. **401 Unauthorized**: Token expired or invalid
   - Solution: Re-authenticate the application

## Example: Complete Encounter Creation

```javascript
// Get current date/time
var now = new Date();
var startDate = now.toISOString();
var endDate = new Date(now.getTime() + 60 * 60 * 1000).toISOString(); // 1 hour later

// Create encounter data
var encounterData = {
  status: 'in-progress',
  class: 'AMB',
  type: 'AMB',
  typeDisplay: 'Ambulatory',
  reasonCode: 'routine',
  reasonDisplay: 'Routine visit',
  startDate: startDate,
  endDate: endDate
};

// Create the encounter
window.createEncounter(encounterData)
  .then(function(response) {
    var encounterId = response.id || response.resource?.id;
    console.log('Successfully created encounter:', encounterId);
    
    // Display success message
    alert('Encounter created successfully! ID: ' + encounterId);
  })
  .catch(function(error) {
    console.error('Failed to create encounter:', error);
    
    // Display error message
    var errorMsg = error.message || 'Unknown error';
    if (error.responseJSON && error.responseJSON.issue) {
      errorMsg = error.responseJSON.issue
        .map(function(i) { return i.details?.text || i.diagnostics; })
        .join(', ');
    }
    alert('Error creating encounter: ' + errorMsg);
  });
```

## Testing

### Using SMART Health IT Sandbox

1. Launch from SMART Health IT sandbox: https://launch.smarthealthit.org/
2. Select FHIR R4
3. Choose a patient
4. Note: The sandbox may have limited write support - test with Cerner for full functionality

### Using Cerner Code Console

1. Register your application in Cerner Code Console
2. Request write scopes for Encounter
3. Launch from Cerner EHR
4. Test encounter creation with appropriate test data

## Security Considerations

1. **Patient Context**: Encounters are automatically linked to the authenticated patient
2. **User Attribution**: The encounter will be attributed to the authenticated user
3. **Audit Trail**: All encounter creations are logged in Cerner's audit system
4. **Permissions**: Only users with appropriate permissions can create encounters

## Troubleshooting

### Encounter Not Created

1. **Check Browser Console**: Look for error messages
2. **Verify OAuth Scopes**: Ensure write scopes are included in the authorization
3. **Check Cerner Logs**: Review Cerner's audit logs for detailed error information
4. **Validate Data**: Ensure all required fields are provided and valid

### CORS Issues

If you encounter CORS errors when writing encounters:

1. Ensure the CORS proxy is running: `python3 cors_proxy.py`
2. The proxy automatically handles POST/PUT requests
3. Check that the proxy URL is correctly configured in `wrapWithProxy()`

### Token Issues

If you get authentication errors:

1. Check that the OAuth token is still valid
2. Re-launch the application to get a fresh token
3. Verify the token includes write scopes

## Additional Resources

- [Cerner FHIR R4 API Documentation](https://fhir.cerner.com/)
- [FHIR Encounter Resource Specification](https://www.hl7.org/fhir/encounter.html)
- [SMART on FHIR Documentation](http://docs.smarthealthit.org/)
- [Cerner Code Console](https://code.cerner.com/)

## Support

For issues specific to:
- **Cerner FHIR API**: Contact Cerner support
- **Application Code**: Review this guide and check browser console for errors
- **OAuth/Authorization**: Verify scopes in Cerner Code Console

---

*Last updated: Based on current implementation*
