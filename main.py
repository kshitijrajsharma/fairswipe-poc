from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import mercantile
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

class TilesRequest(BaseModel):
    aoi: dict | str
    zoom: int
    mini_grid: int

class GeoJSONRequest(BaseModel):
    tile_ids: list[dict]
    category: str

@app.get("/")
async def read_index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/api/tiles")
async def get_tiles(request: TilesRequest):
    try:
        aoi = request.aoi
        if isinstance(aoi, str):
            aoi = json.loads(aoi)
        
        if aoi.get("type") == "FeatureCollection":
            geometry = aoi["features"][0]["geometry"]
            coords = geometry["coordinates"][0]
        elif aoi.get("type") == "Feature":
            coords = aoi["geometry"]["coordinates"][0]
        elif aoi.get("type") == "Polygon":
            coords = aoi["coordinates"][0]
        else:
            raise HTTPException(status_code=400, detail="Invalid AOI format")
        
        lngs = [c[0] for c in coords]
        lats = [c[1] for c in coords]
        west, east = min(lngs), max(lngs)
        south, north = min(lats), max(lats)
        
        mother_zoom = request.zoom
        child_zoom = mother_zoom + request.mini_grid
        
        mother_tiles_set = set()
        for tile in mercantile.tiles(west, south, east, north, mother_zoom):
            mother_tiles_set.add((tile.x, tile.y, tile.z))
        
        mother_tiles = []
        for x, y, z in sorted(mother_tiles_set):
            bounds = mercantile.bounds(x, y, z)
            
            children = []
            for child_tile in mercantile.tiles(bounds.west, bounds.south, bounds.east, bounds.north, child_zoom):
                child_bounds = mercantile.bounds(child_tile.x, child_tile.y, child_tile.z)
                children.append({
                    "x": child_tile.x,
                    "y": child_tile.y,
                    "z": child_tile.z,
                    "bounds": [child_bounds.west, child_bounds.south, child_bounds.east, child_bounds.north]
                })
            
            mother_tiles.append({
                "x": x,
                "y": y,
                "z": z,
                "bounds": [bounds.west, bounds.south, bounds.east, bounds.north],
                "children": children
            })
        
        return {
            "mother_tiles": mother_tiles,
            "config": {
                "zoom": mother_zoom,
                "mini_grid": request.mini_grid,
                "child_zoom": child_zoom
            }
        }
    except ValueError as e:
        logger.error(f"Invalid AOI format: {e}")
        raise HTTPException(status_code=400, detail="Invalid AOI format. Please provide a valid GeoJSON polygon.")
    except Exception as e:
        logger.error(f"Error generating tiles: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate tiles. Please check your input.")

@app.post("/api/geojson")
async def create_geojson(request: GeoJSONRequest):
    try:
        features = []
        for tile in request.tile_ids:
            bounds = mercantile.bounds(tile["x"], tile["y"], tile["z"])
            
            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [bounds.west, bounds.south],
                        [bounds.east, bounds.south],
                        [bounds.east, bounds.north],
                        [bounds.west, bounds.north],
                        [bounds.west, bounds.south]
                    ]]
                },
                "properties": {
                    "category": request.category,
                    "tile_x": tile["x"],
                    "tile_y": tile["y"],
                    "tile_z": tile["z"]
                }
            }
            features.append(feature)
        
        return {
            "type": "FeatureCollection",
            "features": features
        }
    except Exception as e:
        logger.error(f"Error generating GeoJSON: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate GeoJSON. Please check your tile data.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)