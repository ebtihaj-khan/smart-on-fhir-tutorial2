(function(window){
  window.extractData = function() {
    var ret = $.Deferred();

    function onError() {
      console.log('Loading error', arguments);
      ret.reject();
    }

    function onReady(smart)  {
      console.log('SMART client ready:', smart);
      
      if (smart.hasOwnProperty('patient') && smart.patient) {
        console.log('Patient context available');
        console.log('SMART patient object:', smart.patient);
        console.log('SMART state:', smart.state);
        console.log('SMART user:', smart.user);
        console.log('OAuth token scopes:', smart.state.tokenResponse?.scope);
        console.log('Full token response:', smart.state.tokenResponse);
        console.log('FHIR server URL:', smart.state.serverUrl);
        console.log('Client ID:', smart.state.clientId);
        var patient = smart.patient;
        
        // Check if patient.read is available
        if (typeof patient.read === 'function') {
          console.log('Patient.read function available');
          try {
            var pt = patient.read();
            console.log('Patient.read() called successfully');
          } catch (error) {
            console.log('Patient.read() failed:', error);
            console.log('Trying alternative approach with smart.patient.request');
            // Try to get patient data directly
            var pt = smart.patient.request({
              type: 'Patient',
              query: {}
            });
          }
        } else {
          console.log('Patient.read function not available, trying alternative approach');
          // Try to get patient data directly
          var pt = smart.patient.request({
            type: 'Patient',
            query: {}
          });
        }
        
        // Add error handling for the patient Promise
        pt = pt.catch(function(error) {
          console.log('Patient.read() Promise failed:', error);
          console.log('Trying alternative approach with smart.request');
          // Try to get patient data directly using smart.request
          return smart.request({
            url: 'Patient',
            query: {}
          });
        });
        
        // Use the FHIR client API for fetching observations
        var obv = smart.request({
                    url: 'Observation',
                    query: {
                      _count: 10
                    }
                  });

        // Handle Promises properly
        Promise.all([pt, obv]).then(function([patient, obv]) {
        // Handle the FHIR client response format
        console.log('Patient data:', patient);
        console.log('Observations data:', obv);
        
        // Extract patient resource from Bundle if needed
        var patientResource = patient;
        if (patient && patient.resourceType === 'Bundle' && patient.entry && patient.entry.length > 0) {
          patientResource = patient.entry[0].resource;
          console.log('Extracted patient resource from Bundle:', patientResource);
        }
        
        var observations = [];
        if (obv && obv.entry) {
          observations = obv.entry.map(function(entry) { return entry.resource; });
          console.log('Found observations in Bundle.entry:', observations.length);
        } else if (Array.isArray(obv)) {
          observations = obv;
          console.log('Found observations as direct array:', observations.length);
        } else {
          console.log('No observations found. Response structure:', obv);
        }
          
          console.log('Processed observations:', observations);
          var byCodes = function(code) {
            if (!Array.isArray(observations)) {
              console.log('Observations is not an array:', observations);
              return [];
            }
            return observations.filter(function(obs) {
              if (obs && obs.code && obs.code.coding) {
                return obs.code.coding.some(function(coding) {
                  return coding.code === code;
                });
              }
              return false;
            });
          };
          var gender = patientResource.gender;

          var fname = '';
          var lname = '';

          if (typeof patientResource.name !== 'undefined' && patientResource.name.length > 0) {
            if (typeof patientResource.name[0].given !== 'undefined') {
              // Handle both DSTU2 (array) and R4 (string) formats
              if (Array.isArray(patientResource.name[0].given)) {
                fname = patientResource.name[0].given.join(' ');
              } else {
                fname = patientResource.name[0].given;
              }
            }
            if (typeof patientResource.name[0].family !== 'undefined') {
              // Handle both DSTU2 (array) and R4 (string) formats
              if (Array.isArray(patientResource.name[0].family)) {
                lname = patientResource.name[0].family.join(' ');
              } else {
                lname = patientResource.name[0].family;
              }
            }
          }

          var height = byCodes('8302-2');
          var systolicbp = getBloodPressureValue(byCodes('55284-4'),'8480-6');
          var diastolicbp = getBloodPressureValue(byCodes('55284-4'),'8462-4');
          var hdl = byCodes('2085-9');
          var ldl = byCodes('2089-1');

          var p = defaultPatient();
          p.birthdate = patientResource.birthDate;
          p.gender = gender;
          p.fname = fname;
          p.lname = lname;
          p.height = getQuantityValueAndUnit(height[0]);

          if (typeof systolicbp != 'undefined')  {
            p.systolicbp = systolicbp;
          }

          if (typeof diastolicbp != 'undefined') {
            p.diastolicbp = diastolicbp;
          }

          p.hdl = getQuantityValueAndUnit(hdl[0]);
          p.ldl = getQuantityValueAndUnit(ldl[0]);

          ret.resolve(p);
        }).catch(function(error) {
          console.log('Promise error:', error);
          onError();
        });
      } else {
        console.log('No patient context available');
        console.log('SMART client properties:', Object.keys(smart));
        onError();
      }
    }

    FHIR.oauth2.ready(onReady, onError);
    return ret.promise();

  };

  function defaultPatient(){
    return {
      fname: {value: ''},
      lname: {value: ''},
      gender: {value: ''},
      birthdate: {value: ''},
      height: {value: ''},
      systolicbp: {value: ''},
      diastolicbp: {value: ''},
      ldl: {value: ''},
      hdl: {value: ''},
    };
  }

  function getBloodPressureValue(BPObservations, typeOfPressure) {
    var formattedBPObservations = [];
    BPObservations.forEach(function(observation){
      var BP = observation.component.find(function(component){
        return component.code.coding.find(function(coding) {
          return coding.code == typeOfPressure;
        });
      });
      if (BP) {
        observation.valueQuantity = BP.valueQuantity;
        formattedBPObservations.push(observation);
      }
    });

    return getQuantityValueAndUnit(formattedBPObservations[0]);
  }

  function getQuantityValueAndUnit(ob) {
    if (typeof ob != 'undefined' &&
        typeof ob.valueQuantity != 'undefined' &&
        typeof ob.valueQuantity.value != 'undefined' &&
        typeof ob.valueQuantity.unit != 'undefined') {
          return ob.valueQuantity.value + ' ' + ob.valueQuantity.unit;
    } else {
      return undefined;
    }
  }

  window.drawVisualization = function(p) {
    $('#holder').show();
    $('#loading').hide();
    $('#fname').html(p.fname);
    $('#lname').html(p.lname);
    $('#gender').html(p.gender);
    $('#birthdate').html(p.birthdate);
    $('#height').html(p.height);
    $('#systolicbp').html(p.systolicbp);
    $('#diastolicbp').html(p.diastolicbp);
    $('#ldl').html(p.ldl);
    $('#hdl').html(p.hdl);
  };

})(window);
