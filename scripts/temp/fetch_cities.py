import urllib.request, json
try:
    print("Fetching provinces...")
    req = urllib.request.Request("https://www.emsifa.com/api-wilayah-indonesia/api/provinces.json", headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as url:
        provinces = json.loads(url.read().decode())
    
    cities = []
    print(f"Fetching regencies for {len(provinces)} provinces...")
    for prov in provinces:
        req = urllib.request.Request(f"https://www.emsifa.com/api-wilayah-indonesia/api/regencies/{prov['id']}.json", headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as url:
            reg = json.loads(url.read().decode())
            for r in reg:
                cities.append(r['name'])
    
    # Sort and save
    cities.sort()
    with open('src/lib/cities.json', 'w') as f:
        json.dump(cities, f)
    print(f"Successfully saved {len(cities)} cities to src/lib/cities.json")
except Exception as e:
    print("Error:", e)
