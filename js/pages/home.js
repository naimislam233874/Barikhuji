(async () => {
  const cats = [["Apartment", "🏢"], ["Room", "🛏️"], ["Studio", "🏠"], ["Mess/Seat", "🎓"]];
  document.getElementById("categories").innerHTML = cats.map(c => `<a class="tile" href="browse.html?type=${encodeURIComponent(c[0])}">${c[1]} ${c[0]}</a>`).join("");
  const places = ["Dhanmondi", "Gulshan", "Mirpur", "Uttara", "Panchlaish", "Shahbag"];
  document.getElementById("locations").innerHTML = places.map(p => `<a class="tile" href="browse.html?location=${encodeURIComponent(p)}">📍 ${p}</a>`).join("");
  try {
    const f = await BK_API.getProperties({ featured: 1, limit: 3 });
    document.getElementById("featured").innerHTML = f.items.map(BK.propertyCard).join("");
    const b = await BK_API.getProperties({ suitableFor: "Bachelor", limit: 3 });
    document.getElementById("bachelor").innerHTML = b.items.map(BK.propertyCard).join("");
  } catch (e) { document.getElementById("featured").textContent = "Could not load listings. Please try again."; }
})();