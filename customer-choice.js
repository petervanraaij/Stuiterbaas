(() => {
  const form=document.querySelector('#booking-form');
  if(!form)return;
  document.querySelectorAll('[data-rental-choice]').forEach(button=>button.addEventListener('click',()=>{
    const value=button.dataset.rentalChoice;
    if(!['1','2'].includes(value))return;
    form.elements.rentalDays.value=value;
    form.elements.rentalDays.dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelector('#reserveren').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});
    form.elements.date.focus({preventScroll:true});
  }));
})();
