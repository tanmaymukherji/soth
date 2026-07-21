// Local Government Directory — States and Districts of India
window.SOTH_LGD = {
  states: [
    { code: '01', name: 'Andhra Pradesh' },
    { code: '02', name: 'Arunachal Pradesh' },
    { code: '03', name: 'Assam' },
    { code: '04', name: 'Bihar' },
    { code: '05', name: 'Chhattisgarh' },
    { code: '06', name: 'Goa' },
    { code: '07', name: 'Gujarat' },
    { code: '08', name: 'Haryana' },
    { code: '09', name: 'Himachal Pradesh' },
    { code: '10', name: 'Jharkhand' },
    { code: '11', name: 'Karnataka' },
    { code: '12', name: 'Kerala' },
    { code: '13', name: 'Madhya Pradesh' },
    { code: '14', name: 'Maharashtra' },
    { code: '15', name: 'Manipur' },
    { code: '16', name: 'Meghalaya' },
    { code: '17', name: 'Mizoram' },
    { code: '18', name: 'Nagaland' },
    { code: '19', name: 'Odisha' },
    { code: '20', name: 'Punjab' },
    { code: '21', name: 'Rajasthan' },
    { code: '22', name: 'Sikkim' },
    { code: '23', name: 'Tamil Nadu' },
    { code: '24', name: 'Telangana' },
    { code: '25', name: 'Tripura' },
    { code: '26', name: 'Uttar Pradesh' },
    { code: '27', name: 'Uttarakhand' },
    { code: '28', name: 'West Bengal' },
    { code: '29', name: 'Andaman & Nicobar Islands' },
    { code: '30', name: 'Chandigarh' },
    { code: '31', name: 'Dadra & Nagar Haveli and Daman & Diu' },
    { code: '32', name: 'Delhi' },
    { code: '33', name: 'Jammu & Kashmir' },
    { code: '34', name: 'Ladakh' },
    { code: '35', name: 'Lakshadweep' },
    { code: '36', name: 'Puducherry' }
  ],
  getStateName: function (code) {
    const s = this.states.find(s => s.code === code);
    return s ? s.name : code;
  },
  getStateCode: function (name) {
    const s = this.states.find(s => s.name.toLowerCase() === name.toLowerCase());
    return s ? s.code : null;
  }
};
