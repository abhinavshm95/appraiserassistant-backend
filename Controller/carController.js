const axios = require("axios");
// const { vehicle } = require("../model");
// const pdf = require("html-pdf");

const PDFDocument = require("pdfkit");
const stream = require("stream");
const ejs = require("ejs");
const path = require("path");
const fs = require("fs");
// const { chromium } = require("playwright");
const http = require("http");
const sharp = require("sharp");
const sequelize = require("../connect/postgresqlConnnection.js");
const SearchLog = require("../model/SearchLog"); // Import SearchLog
const { PAGINATION, SEARCH, PDF, API_KEYS, MANUFACTURERS, DEFAULT_CAR_VALUES } = require("../constants/config");

const PDF2 = {
  MARGIN: 40,
  FONT_SIZES: {
    TITLE: 22,
    BODY: 12,
  },
};

const CARD_WIDTH = 180;
const CARD_HEIGHT = 280;
const IMAGE_HEIGHT = 100;
const GAP = 20;
const CARDS_PER_ROW = 3;

// async function getLatLonByPostalCode(postalCode) {
//   const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(postalCode)}`;
//   const response = await axios.get(url);
//   console.log('response', response)
//   return response.data.length > 0 ? { lat: response.data[0].lat, lon: response.data[0].lon } : null;
// }

// const getLatLonByPostalCode = async (postal_code) => {
//   try {
//     const formatted = postal_code.trim().replace(/\s+/g, "");
//     const url = `https://nominatim.openstreetmap.org/search?postalcode=${formatted}&country=USA&format=json&limit=1`;

//     const response = await axios.get(url, {
//       headers: { "User-Agent": "YourAppName/1.0" }
//     });

//     if (response.data.length > 0) {
//       return {
//         lat: parseFloat(response.data[0].lat),
//         lon: parseFloat(response.data[0].lon),
//       };
//     }

//     return null;
//   } catch (error) {
//     console.error("Error in getLatLonByPostalCode:", error.message);
//     return null;
//   }
// };

const carMarketValue = async (req, res, next) => {
  try {
    const { vin } = req.params;
    const options = {
      method: "GET",
      url: `https://api.vehicledatabases.com/premium/vin-decode/${vin}`,
      headers: {
        "x-AuthKey": API_KEYS.VEHICLE_DB,
      },
    };
    const response = await axios(options);
    const [matchedMake] = await sequelize.query(
      `
          SELECT * FROM manufacturers WHERE name ILIKE :searchTerm LIMIT 1`,
      {
        replacements: {
          searchTerm: `%${response.data?.data?.basic?.make}%`,
        },
      },
    );
    if (matchedMake.length) {
      const [matchedModels] = await sequelize.query(
        `
            SELECT name FROM models WHERE manufacturer_id = :searchTerm`,
        {
          replacements: {
            searchTerm: matchedMake[0].id,
          },
        },
      );
      const match = findMatchingModel(response.data?.data?.basic?.model, matchedModels);
      if (match) {
        response.data.data.basic.model = match.name;
      }
    }
    return res.status(200).json({
      message: "Fetched Successfully",
      result: response.data,
    });
  } catch (err) {
    return res.status(500).json({
      message: "Internal Error.",
      data: err,
    });
  }
};

const carinfoByVin = async (req, res, next) => {
  try {
    const { vin } = req.params;
    let options = {
      method: "GET",
      url: `https://auto.dev/api/vin/${vin}?`,
      headers: {
        Authorization: `Bearer ${API_KEYS.AUTO_DEV}`,
      },
    };
    const listing = await axios(options);
    return res.status(200).json({
      message: "Car Info by Vin Decode",
      result: listing.data,
    });
  } catch (err) {
    console.log(err.response, "error in carinfoByVin");
    next(err);
  }
};

const carListing = async (req, res, next) => {
  try {
    let baseUrl = `https://auto.dev/api/listings`;
    let queryParams = { sort_filter: "price:desc" };

    queryParams.apiKey = API_KEYS.AUTO_DEV;
    queryParams.apiKey += "=";

    if (req.query.year_min) {
      queryParams.year_min = req.query.year_min;
    }
    if (req.query.year_max) {
      queryParams.year_max = req.query.year_max;
    }
    if (req.query.trim) {
      queryParams.trim = req.query.trim; // Fixed missing semicolon
      // Log the search
      try {
        if (req.user) {
          await SearchLog.create({
            userId: req.user._id,
            query: req.query,
            endpoint: "/car-listing",
          });
        }
      } catch (logError) {
        console.error("Failed to log search query:", logError);
      }
      // const [matched] = await sequelize.query(`
      //     SELECT
      //       title,
      //       regexp_matches(title, :regexPattern, 'i') AS matched_words
      //     FROM cars
      //     WHERE title ILIKE :searchTerm
      //     AND title ILIKE :mustContainPattern
      //     LIMIT 1`,
      //   {
      //     replacements: {
      //       searchTerm: `%${req.query.trim}%`,
      //       mustContainPattern: `%${req.query.make}%`,
      //       regexPattern: req.query.trim,
      //     },
      //   });

      // if (matched.length) {
      //   queryParams.trim = matched[0]?.matched_words[0] || req.query.trim
      // }
      // if (req.query.trim?.toLowerCase() == "ex-l") {
      //   queryParams.trim = "EX-L"
      // }
      // if (req.query.trim?.toLowerCase() == "ex") {
      //   queryParams.trim = "EX"
      // }
      // if (req.query.trim == req.query.trim.toUpperCase() || /[A-Z]{2}/.test(req.query.trim)) {
      //   queryParams.trim = req.query.trim
      // }
    }
    if (req.query.mileage) {
      queryParams.mileage = req.query.mileage;
    }

    if (req.query.model) {
      queryParams.model =
        req.query.model.trim().replace(/ /g, "%20").charAt(0).toUpperCase() +
        req.query.model.trim().replace(/ /g, "%20").slice(1);
    }

    if (req.query.make) {
      queryParams.make = req.query.make;
    }
    if (req.query.zip) {
      queryParams.zip = req.query.zip;
    }
    if (req.query.radius) {
      queryParams.radius = req.query.radius;
    }
    if (req.query.price_max) {
      queryParams.price_max = req.query.price_max;
    }

    if (req.query.price_min) {
      queryParams.price_min = req.query.price_min;
    }

    if (req.query.page) {
      queryParams.page = req.query.page;
    }

    let urlString = baseUrl;
    if (Object.keys(queryParams).length > 0) {
      urlString += "?";
      let firstParam = true;
      for (const [key, value] of Object.entries(queryParams)) {
        if (!firstParam) {
          urlString += "&";
        }
        urlString += `${key}=${value}`;
        firstParam = false;
      }
    }

    const options = {
      method: "GET",
      url: urlString,
    };

    const response = await axios(options);
    if (response.data?.records?.length > 0) {
      const originalTotalCount = response.data?.totalCount;
      const totalCountFormattedCount = response.data?.totalCountFormatted;
      const originalRecordCount = response.data?.hitsCount;
      response.data.records = response.data.records.filter((record) => {
        return isPrice(record.price);
      });
      response.data.hitsCount = response.data.records.length;
      if (originalRecordCount !== response.data.hitsCount) {
        const noOfRecordRemoved = originalRecordCount - response.data.hitsCount;
        response.data.totalCountFormatted = totalCountFormattedCount - noOfRecordRemoved;
        response.data.totalCount = originalTotalCount - noOfRecordRemoved;
      }
    }
    return res.status(200).json({
      message: "Car List",
      recordsss: response.data.records.length,
      result: response.data,
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message,
    });
  }
};

const premiumPlusVinDecode = async (req, res) => {
  try {
    const vin = req.params.vin;
    const options = {
      method: "GET",
      url: `https://api.vehicledatabases.com/advanced-vin-decode/${vin}`,
      headers: {
        "x-AuthKey": API_KEYS.VEHICLE_DB,
      },
    };
    const response = await axios(options);
    return res.status(200).json(response.data);
  } catch (error) {
    res.status(500).send("An error occurred");
  }
};

const saleHistory = async (req, res, next) => {
  try {
    const { vin } = req.params;
    let option = {
      method: "GET",
      url: `https://api.vehicledatabases.com/saleshistory/${vin}`,
      headers: {
        "x-authKey": API_KEYS.VEHICLE_DB,
      },
    };
    const response = await axios(option);
    return res.status(200).json({
      message: "Sale History on the basis of Vin Code",
      result: response.data,
    });
  } catch (err) {
    return res.status(200).json({
      message: "Sale History on the basis of Vin Code",
      result: [],
    });
  }
};

//----------------------------------------------------------

////working code for salvage car list

//working code end here for final deployment:-----------
const getLatLonByPostalCode = async (postal_code) => {
  try {
    const formatted = postal_code.trim().replace(/\s+/g, "");
    const url = `https://nominatim.openstreetmap.org/search?postalcode=${formatted}&country=USA&format=json&limit=1`;

    const response = await axios.get(url, {
      headers: { "User-Agent": "AppraiserAssistant/1.0 (support@appraiser-assistant.com)" },
    });

    if (response.data.length > 0) {
      return {
        lat: parseFloat(response.data[0].lat),
        lon: parseFloat(response.data[0].lon),
      };
    }

    return null;
  } catch (error) {
    console.error("Error in getLatLonByPostalCode:", error.message);
    return null;
  }
};

//production code:----------
// const salvageCarListbyPost = async (req, res) => {
//   try {
//     const page = parseInt(req.query.page, 10) || 1;
//     const limit = parseInt(req.query.limit, 10) || 20;
//     const offset = (page - 1) * limit;

//     let {
//       model,
//       manufacturer,
//       year,
//       postal_code,
//       mileage_min,
//       mileage_max,
//       year_min,
//       year_max,
//       latitude,
//       longitude,
//       radius,
//       title,
//     } = req.query;

//     let whereClauses = [];
//     let replacements = { limit, offset };

//     if (manufacturer) {
//       whereClauses.push("man.name ILIKE :manufacturer");
//       replacements.manufacturer = `%${manufacturer}%`;
//     }
//     if (model) {
//       whereClauses.push("model.name ILIKE :model");
//       replacements.model = `%${model}%`;
//     }
//     if (title) {
//       whereClauses.push("car.title ILIKE :title");
//       replacements.title = `%${title}%`;
//     }
//     if (year) {
//       whereClauses.push("car.year = :year");
//       replacements.year = parseInt(year, 10);
//     }
//     if (year_min) {
//       whereClauses.push("car.year >= :year_min");
//       replacements.year_min = parseInt(year_min, 10);
//     }
//     if (year_max) {
//       whereClauses.push("car.year <= :year_max");
//       replacements.year_max = parseInt(year_max, 10);
//     }
//     if (mileage_min) {
//       whereClauses.push("lot.odometer_mi >= :mileage_min");
//       replacements.mileage_min = parseInt(mileage_min, 10);
//     }
//     if (mileage_max) {
//       whereClauses.push("lot.odometer_mi <= :mileage_max");
//       replacements.mileage_max = parseInt(mileage_max, 10);
//     }

//     if (postal_code && (!latitude || !longitude)) {
//       const coordinates = await getLatLonByPostalCode(postal_code);
//       if (coordinates) {
//         latitude = coordinates.lat;
//         longitude = coordinates.lon;
//       } else {
//         return res
//           .status(400)
//           .json({ error: "Invalid postal_code, no coordinates found" });
//       }
//     }

//     const hasCoordinates = latitude && longitude;
//     replacements.latitude = hasCoordinates ? parseFloat(latitude) : 0;
//     replacements.longitude = hasCoordinates ? parseFloat(longitude) : 0;

//     if (hasCoordinates) {
//       const radiusInKm = parseFloat(radius) || 1000;
//       replacements.radius = radiusInKm;

//       whereClauses.push(`
//         (
//           6371 * acos(
//             cos(radians(:latitude)) *
//             cos(radians(lot.latitude)) *
//             cos(radians(lot.longitude) - radians(:longitude)) +
//             sin(radians(:latitude)) *
//             sin(radians(lot.latitude))
//           )
//         ) <= :radius
//       `);
//     }

//     const whereQuery = whereClauses.length
//       ? `WHERE ${whereClauses.join(" AND ")}`
//       : "";

//     const query = `
//       SELECT
//         car.id AS car_id, car.vin, car.year, car.title,
//         car.manufacturer_id, car.model_id, car.generation_id,
//         car.body_type, car.color, car.engine_id, car.transmission,
//         car.drive_wheel, car.vehicle_type, car.fuel, car.cylinders,
//         car.views, car.sitemap_id, car.created_at, car.updated_at,
//         car.download_specs_at, car.processed_specs_at, car.has_images,
//         car.has_bid,car.has_buy_now, car.is_hidden, car.is_archived,
//         car.engine_volume,
//         man.name AS manufacturer, model.name AS model,
//         lot.id AS lot_id, lot.buy_now_price, lot.estimate_repair_price, lot.sale_date, lot.actual_cash_value, lot.bid, lot.final_bid_updated_at,lot.odometer_mi AS mileage,
//         lot.latitude, lot.longitude, lot.seller_id,
//         location.name AS location,
//         city.name AS city, state.name AS state, lot.postal_code,
//         seller.name AS seller_name,
//         eng.id AS engine_id, eng.name AS eng_name,
//         COALESCE(JSON_AGG(DISTINCT img.images::TEXT) FILTER (WHERE img.images IS NOT NULL), '[]') AS images,
//         (
//           6371 * acos(
//             cos(radians(:latitude)) *
//             cos(radians(lot.latitude)) *
//             cos(radians(lot.longitude) - radians(:longitude)) +
//             sin(radians(:latitude)) *
//             sin(radians(lot.latitude))
//           )
//         ) AS distance
//       FROM cars car
//       JOIN lots lot ON car.id = lot.car_id
//       JOIN manufacturers man ON man.id = car.manufacturer_id
//       JOIN models model ON car.model_id = model.id
//       JOIN sellers seller ON lot.seller_id = seller.id
//       JOIN locations location ON lot.location_id = location.id
//       JOIN cities city ON lot.city_id = city.id
//       JOIN states state ON lot.state_id = state.id
//       JOIN engines eng ON car.engine_id = eng.id
//       LEFT JOIN images img ON car.id = img.car_id
//       ${whereQuery}
//       GROUP BY car.id, man.name, model.name, lot.id, lot.latitude, lot.longitude,
//                location.name, city.name, state.name, lot.postal_code, seller.name, eng.id
//       LIMIT :limit OFFSET :offset;
//     `;

//     const carLots = await sequelize.query(query, {
//       replacements,
//       type: sequelize.QueryTypes.SELECT,
//     });

//     return res.status(200).json({ page, limit, data: carLots });
//   } catch (error) {
//     console.error("Error in salvageCarListbyPost:", error.message);
//     return res.status(500).json({ error: "Internal Server Error" });
//   }
// };

//production code end here--------------------

//testing code------------------
const salvageCarListbyPost = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || PAGINATION.DEFAULT_PAGE_NUMBER;
    const limit = parseInt(req.query.limit, 10) || PAGINATION.CAR_SALVAGE_PAGE_SIZE;
    const offset = (page - 1) * limit;

    let {
      model,
      manufacturer,
      year,
      postal_code,
      mileage_min,
      mileage_max,
      year_min,
      year_max,
      latitude,
      price_max,
      price_min,
      longitude,
      radius,
      title,
      trim,
    } = req.query;

    // Log the search for salvage queries
    try {
      // We log even if not authenticated if we want general metrics, but requirements said "users".
      // We'll log if req.user is present.
      if (req.user) {
        await SearchLog.create({
          userId: req.user._id,
          query: req.query,
          endpoint: "/salvage-listing",
        });
      }
    } catch (logError) {
      console.error("Failed to log salvage search query:", logError);
    }

    let whereClauses = [];
    let replacements = { limit, offset };

    if (manufacturer) {
      whereClauses.push("man.name ILIKE :manufacturer");
      replacements.manufacturer = `%${manufacturer}%`;
    }
    if (model) {
      whereClauses.push("model.name ILIKE :model");
      replacements.model = `%${model}%`;
    }
    if (title) {
      whereClauses.push("car.title ILIKE :title");
      replacements.title = `%${title}%`;
    }
    if (trim) {
      whereClauses.push("car.title ILIKE :trim");
      replacements.trim = `%${trim}%`;
    }
    if (year) {
      whereClauses.push("car.year = :year");
      replacements.year = parseInt(year, 10);
    }
    if (year_min) {
      whereClauses.push("car.year >= :year_min");
      replacements.year_min = parseInt(year_min, 10);
    }
    if (year_max) {
      whereClauses.push("car.year <= :year_max");
      replacements.year_max = parseInt(year_max, 10);
    }
    if (mileage_min) {
      whereClauses.push("lot.odometer_mi >= :mileage_min");
      replacements.mileage_min = parseInt(mileage_min, 10);
    }
    if (mileage_max) {
      whereClauses.push("lot.odometer_mi <= :mileage_max");
      replacements.mileage_max = parseInt(mileage_max, 10);
    }
    // if (price_min) {
    //   whereClauses.push("lot.bid >= :price_min");
    //   replacements.price_min = parseFloat(req.query.price_min);
    // }
    // if (price_max) {
    //   whereClauses.push("lot.bid <= :price_max");
    //   replacements.price_max = parseFloat(req.query.price_max);
    // }

    if (price_min) {
      whereClauses.push("lot.bid >= :price_min");
      replacements.price_min = Number(price_min);
    }
    console.log("price_max", price_max);
    if (price_max) {
      whereClauses.push("lot.bid <= :price_max");
      replacements.price_max = Number(price_max);
    }

    if (postal_code && (!latitude || !longitude)) {
      const coordinates = await getLatLonByPostalCode(postal_code);
      if (coordinates) {
        latitude = coordinates.lat;
        longitude = coordinates.lon;
      } else {
        return res.status(400).json({ error: "Invalid postal_code, no coordinates found" });
      }
    }

    const hasCoordinates = latitude && longitude;
    replacements.latitude = hasCoordinates ? parseFloat(latitude) : 0;
    replacements.longitude = hasCoordinates ? parseFloat(longitude) : 0;

    if (hasCoordinates) {
      const radiusInKm = parseFloat(radius) || SEARCH.DEFAULT_RADIUS;
      replacements.radius = radiusInKm;

      whereClauses.push(`
        (
          6371 * acos(
            cos(radians(:latitude)) *
            cos(radians(lot.latitude)) *
            cos(radians(lot.longitude) - radians(:longitude)) +
            sin(radians(:latitude)) *
            sin(radians(lot.latitude))
          )
        ) <= :radius
      `);
    }

    const whereQuery = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const query = `
      SELECT 
        car.id AS car_id, car.vin, car.year, car.title, 
        car.manufacturer_id, car.model_id, car.generation_id,
        car.body_type, car.color, car.engine_id, car.transmission, 
        car.drive_wheel, car.vehicle_type, car.fuel, car.cylinders, 
        car.views, car.sitemap_id, car.created_at, car.updated_at, 
        car.download_specs_at, car.processed_specs_at, car.has_images, 
        car.has_bid, car.has_buy_now, car.is_hidden, car.is_archived, 
        car.engine_volume,
        man.name AS manufacturer, model.name AS model, 
        lot.id AS lot_id, lot.buy_now_price, lot.estimate_repair_price, 
        lot.sale_date, lot.actual_cash_value, lot.bid,
        
        lot.domain_id, lot.final_bid_updated_at, lot.odometer_mi AS mileage, 
        lot.latitude, lot.longitude, lot.seller_id, 
        location.name AS location, 
        city.name AS city, state.name AS state, lot.postal_code,
        seller.name AS seller_name,
        eng.id AS engine_id, eng.name AS eng_name,
        COALESCE(JSON_AGG(DISTINCT img.images::TEXT) FILTER (WHERE img.images IS NOT NULL), '[]') AS images,
        (
          6371 * acos(
            cos(radians(:latitude)) *
            cos(radians(lot.latitude)) *
            cos(radians(lot.longitude) - radians(:longitude)) +
            sin(radians(:latitude)) *
            sin(radians(lot.latitude))
          )
        ) AS distance
      FROM cars car
      JOIN lots lot ON car.id = lot.car_id
      JOIN manufacturers man ON man.id = car.manufacturer_id
      JOIN models model ON car.model_id = model.id
      JOIN sellers seller ON lot.seller_id = seller.id
      JOIN locations location ON lot.location_id = location.id
      JOIN cities city ON lot.city_id = city.id
      JOIN states state ON lot.state_id = state.id
      JOIN engines eng ON car.engine_id = eng.id
      LEFT JOIN images img ON car.id = img.car_id
      ${whereQuery}
      GROUP BY car.id, man.name, model.name, lot.id, lot.latitude, lot.longitude,
              location.name, city.name, state.name, lot.postal_code, seller.name, eng.id
      LIMIT :limit OFFSET :offset;
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT car.id) as total
      FROM cars car
      JOIN lots lot ON car.id = lot.car_id
      JOIN manufacturers man ON man.id = car.manufacturer_id
      JOIN models model ON car.model_id = model.id
      JOIN sellers seller ON lot.seller_id = seller.id
      JOIN locations location ON lot.location_id = location.id
      JOIN cities city ON lot.city_id = city.id
      JOIN states state ON lot.state_id = state.id
      JOIN engines eng ON car.engine_id = eng.id
      ${whereQuery};
    `;

    const [carLotsResult, countResult] = await Promise.all([
      sequelize.query(query, {
        replacements,
        type: sequelize.QueryTypes.SELECT,
      }),
      sequelize.query(countQuery, {
        replacements,
        type: sequelize.QueryTypes.SELECT,
      }),
    ]);

    const carLots = carLotsResult;
    const total = countResult[0]?.total || 0;

    return res.status(200).json({ page, limit, totalCount: total, data: carLots });
  } catch (error) {
    console.error("Error in salvageCarListbyPost:", error.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
//testing code end here------------------

const marketingValueCarListbypostforradius = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;

    let {
      model,
      manufacturer,
      year,
      postal_code,
      year_min,
      year_max,
      latitude,
      longitude,
      radius,
      mileage_min,
      mileage_max,
    } = req.query;

    let whereClauses = ["car.has_bid = false"];
    let replacements = { limit, offset };

    if (manufacturer) {
      whereClauses.push("man.name ILIKE :manufacturer");
      replacements.manufacturer = `%${manufacturer}%`;
    }
    if (model) {
      whereClauses.push("model.name ILIKE :model");
      replacements.model = `%${model}%`;
    }
    if (year) {
      whereClauses.push("car.year = :year");
      replacements.year = parseInt(year, 10);
    }
    if (year_min) {
      whereClauses.push("car.year >= :year_min");
      replacements.year_min = parseInt(year_min, 10);
    }
    if (year_max) {
      whereClauses.push("car.year <= :year_max");
      replacements.year_max = parseInt(year_max, 10);
    }
    if (mileage_min) {
      whereClauses.push("lot.odometer_mi >= :mileage_min");
      replacements.mileage_min = parseInt(mileage_min, 10);
    }
    if (mileage_max) {
      whereClauses.push("lot.odometer_mi <= :mileage_max");
      replacements.mileage_max = parseInt(mileage_max, 10);
    }
    if (postal_code && !latitude && !longitude) {
      const coordinates = await getLatLonByPostalCode(postal_code);
      if (coordinates) {
        latitude = coordinates.lat;
        longitude = coordinates.lon;
      }
    }

    const hasCoordinates = latitude && longitude;
    replacements.latitude = hasCoordinates ? parseFloat(latitude) : 0;
    replacements.longitude = hasCoordinates ? parseFloat(longitude) : 0;

    if (hasCoordinates) {
      const radiusInKm = parseFloat(radius) || SEARCH.DEFAULT_RADIUS_MARKET;
      whereClauses.push(`
        (6371 * acos(
          cos(radians(:latitude)) *
          cos(radians(lot.latitude)) *
          cos(radians(lot.longitude) - radians(:longitude)) +
          sin(radians(:latitude)) *
          sin(radians(lot.latitude))
        )) <= :radius
      `);
      replacements.radius = radiusInKm;
    }

    const whereQuery = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const orderBy = hasCoordinates ? "distance" : "car.id";

    const query = `
     SELECT 
    car.id AS car_id, car.vin, car.year, car.title,
    car.manufacturer_id, car.model_id, car.generation_id,
    car.body_type, car.color, car.engine_id, car.transmission,
    car.drive_wheel, car.vehicle_type, car.fuel, car.cylinders,
    car.views, car.sitemap_id, car.created_at, car.updated_at,
    car.download_specs_at, car.processed_specs_at, car.has_images,
    car.has_bid, car.has_buy_now, car.is_hidden, car.is_archived,
    car.engine_volume, engine.name AS engine_name,
    man.name AS manufacturer, model.name AS model,
    lot.id AS lot_id, lot.actual_cash_value, lot.buy_now_price, lot.bid, lot.odometer_km, lot.odometer_mi,
    lot.latitude, lot.longitude, lot.seller_id,
    location.name AS location,
    city.name AS city, state.name AS state, lot.postal_code,
    seller.name AS seller_name,
    COALESCE(JSON_AGG(DISTINCT img.images::TEXT) FILTER (WHERE img.images IS NOT NULL), '[]') AS images,
    (6371 * acos(
      cos(radians(:latitude)) *
      cos(radians(lot.latitude)) *
      cos(radians(lot.longitude) - radians(:longitude)) +
      sin(radians(:latitude)) *
      sin(radians(lot.latitude))
    )) AS distance
FROM cars car
JOIN lots lot ON car.id = lot.car_id
JOIN manufacturers man ON man.id = car.manufacturer_id
JOIN models model ON car.model_id = model.id
JOIN sellers seller ON lot.seller_id = seller.id
JOIN locations location ON lot.location_id = location.id
JOIN cities city ON lot.city_id = city.id
JOIN states state ON lot.state_id = state.id
JOIN engines engine ON car.engine_id = engine.id
LEFT JOIN images img ON car.id = img.car_id
${whereQuery}
GROUP BY car.id, man.name, model.name, lot.id, lot.latitude, lot.longitude,
         location.name, city.name, state.name, lot.postal_code, seller.name, engine.name
ORDER BY ${orderBy}
LIMIT :limit OFFSET :offset;
    `;

    const carLots = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    return res.status(200).json({ page, limit, data: carLots });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const carFilteraton = async (req, res, next) => {
  try {
    const { year_min, make, model, city, state, exterior_color, page } = req.body;
    const api = `https://auto.dev/api/listings?apikey=${API_KEYS.AUTO_DEV}&year_min=${year_min}&make=${make}&model=${model}&trim[]=Base&trim[]=SH-AWD&city=${city}&state=${state}&page=${page}`;
    let options = {
      method: "GET",
      url: api,
    };
    const result = await axios(options);
    return res.status(200).json({
      message: "Fetch Successfully",
      result: result.data,
    });
  } catch (err) {
    next(err);
  }
};

const auction = async (req, res, next) => {
  try {
    const { vin } = req.params;
    const api = `https://api.vehicledatabases.com/auction/${vin}`;
    let option = {
      method: "GET",
      url: api,
      headers: {
        "x-authKey": API_KEYS.VEHICLE_DB,
      },
    };
    let result = await axios(option);
    return res.status(200).json({
      message: "Fetch Successfully",
      result: result.data,
    });
  } catch (err) {
    return res.status(200).json({
      message: "Auction History on the basis of Vin Code",
      result: [],
      error: err,
    });
  }
};

const premiumVinDecode = async (req, res, next) => {
  try {
    const { vin } = req.params;
    const api = `https://api.vehicledatabases.com/premium/vin-decode/${vin}`;
    let option = {
      method: "GET",
      url: api,
      headers: {
        "x-authKey": API_KEYS.VEHICLE_DB,
      },
    };
    const result = await axios(option);
    return res.status(200).json({
      message: "Fetch Successfully",
      result: result.data,
    });
  } catch (err) {
    next(err);
  }
};

const marketValuebyVin = async (req, res, next) => {
  try {
    const { vin } = req.query;
    const api = `https://api.vehicledatabases.com/market-value/v2/${vin}`;
    let option = {
      method: "GET",
      url: api,
      headers: {
        "x-authKey": `2e9b54370c164ed388adc4ddac50fa9f`,
      },
    };
    const { data } = await axios(option);
    return res.status(200).json({
      message: "Fetch Successfully",
      result: data,
      vin,
    });
  } catch (err) {
    return res.status(500).json({
      statusCode: 500,
      message: err.message,
    });
  }
};

const marketValuebyYearAndModel = async (req, res, next) => {
  try {
    const { year, make, model, mileage_value, state } = req.query;
    const api = `https://api.vehicledatabases.com/market-value/v2/ymm/${year}/${make}/${model}?state=${state}&mileage=${mileage_value}`;
    let option = {
      method: "GET",
      url: api,
      headers: {
        "x-authKey": API_KEYS.VEHICLE_DB,
      },
    };
    const { data } = await axios(option);
    return res.status(200).json({
      message: "Fetch Successfully",
      result: data,
    });
  } catch (err) {
    next(err);
  }
};

const vehicleRepair = async (req, res, next) => {
  try {
    const { year, make, model } = req.query;
    const api = `https://api.vehicledatabases.com/vehicle-repairs/${year}/${make}/${model}`;
    let option = {
      method: "GET",
      url: api,
      headers: {
        "x-authKey": API_KEYS.VEHICLE_DB,
      },
    };
    const { data } = await axios(option);
    return res.status(200).json({
      message: "Fetch Successfully",
      result: data,
    });
  } catch (err) {
    next(err);
  }
};

const vehicleWarranty = async (req, res, next) => {
  try {
    const { year, make, model } = req.query;
    const api = `https://api.vehicledatabases.com/vehicle-warranty/${year}/${make}/${model}$`;
    let option = {
      method: "GET",
      url: api,
      headers: {
        "x-authKey": API_KEYS.VEHICLE_DB,
      },
    };
    const { data } = await axios(option);
    return res.status(200).json({
      message: "Fetch Successfully",
      result: data,
    });
  } catch (err) {
    next(err);
  }
};

const marketValue = async (req, res, next) => {
  try {
    const { vin, state, mileage } = req.params;

    const response = await axios.get(`https://api.vehicledatabases.com/market-value/v2/${vin}`, {
      params: {
        state: state,
        mileage: mileage,
      },
      headers: {
        "x-AuthKey": API_KEYS.VEHICLE_DB,
      },
    });
    return res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: "An error occurred while fetching the market value." });
  }
};

const generateReport = async (req, res, next) => {
  try {
    const data = req.body;

    const htmlTemplate = `
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 20px;
            color: #333;
          }
          h1 {
            color: #4CAF50;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          table, th, td {
            border: 1px solid #ddd;
            padding: 8px;
          }
          th {
            background-color: #f2f2f2;
          }
          .section {
            margin-bottom: 40px;
          }
          .section-title {
            font-size: 20px;
            color: #4CAF50;
            margin-bottom: 10px;
          }
          .market-value-table {
            width: 100%;
            border-collapse: collapse;
          }
          .market-value-table th {
            background-color: #f2f2f2;
          }
        </style>
      </head>
      <body>
        <h1>Vehicle Report</h1>
        
        <div class="section">
          <div class="section-title">Vehicle Details</div>
          <table>
            <tr><th>VIN</th><td>${data.intro.vin}</td></tr>
            <tr><th>Make</th><td>${data.basic.make}</td></tr>
            <tr><th>Model</th><td>${data.basic.model}</td></tr>
            <tr><th>Year</th><td>${data.basic.year}</td></tr>
            <tr><th>Trim</th><td>${data.basic.trim}</td></tr>
          </table>
        </div>

        <div class="section">
          <div class="section-title">Market Value</div>
          <table class="market-value-table">
            <tr>
              <th>Condition</th>
              <th>Trade-In</th>
              <th>Private Party</th>
              <th>Dealer Retail</th>
            </tr>
            ${
              Array.isArray(data.market_value.market_value_data) &&
              data.market_value.market_value_data[0] &&
              Array.isArray(data.market_value.market_value_data[0]["market value"])
                ? data.market_value.market_value_data[0]["market value"]
                    .map(
                      (mv) => `
                <00000000000tr>
                  <td>${mv.Condition}</td>
                  <td>${mv["Trade-In"]}</td>
                  <td>${mv["Private Party"]}</td>
                  <td>${mv["Dealer Retail"]}</td>
                </tr>
              `,
                    )
                    .join("")
                : '<tr><td colspan="4">No market value data available</td></tr>'
            }
          </table>
        </div>

        <div class="section">
          <div class="section-title">Engine Specifications</div>
          <table>
            <tr><th>Engine</th><td>${data.engine.name}</td></tr>
            <tr><th>Cylinder</th><td>${data.engine.cylinder}</td></tr>
            <tr><th>Size</th><td>${data.engine.size} L</td></tr>
            <tr><th>Horsepower</th><td>${data.engine.horsepower}</td></tr>
            <tr><th>Torque</th><td>${data.engine.torque} lb-ft</td></tr>
          </table>
        </div>

        <div class="section">
          <div class="section-title">Transmission</div>
          <table>
            <tr><th>Type</th><td>${data.transmission.transmissionType}</td></tr>
            <tr><th>Number of Speeds</th><td>${data.transmission.numberOfSpeeds}</td></tr>
          </table>
        </div>

        <div class="section">
          <div class="section-title">Fuel Efficiency</div>
          <table>
            <tr><th>Highway MPG</th><td>${data.mpg.highway}</td></tr>
            <tr><th>City MPG</th><td>${data.mpg.city}</td></tr>
          </table>
        </div>
      </body>
      </html>
    `;

    // Launch Playwright and generate PDF
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(htmlTemplate);
    const buffer = await page.pdf({ format: "A4" });

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="vehicle_report.pdf"');
    res.setHeader("Content-Length", buffer.length);

    res.send(buffer);
  } catch (err) {
    next(err);
  }
};

//-------------working code-------------------
// const generateFreetrialPdf = async (req, res, next) => {
//   try {
//     const data = req.body;
//     const htmlTemplate = `
//       <html>
//       <head>
//         <style>
//           body {
//             font-family: 'Helvetica Neue', Arial, sans-serif;
//             margin: 0;
//             padding: 40px;
//             background-color: #f4f4f4;
//             color: #333;
//             line-height: 1.6;
//           }
//           h1 {
//             font-size: 28px;
//             color: #222;
//             border-bottom: 2px solid #333;
//             padding-bottom: 10px;
//             margin-bottom: 20px;
//           }
//           h2 {
//             font-size: 22px;
//             color: #444;
//             border-left: 4px solid #00aaff;
//             padding-left: 10px;
//             margin-bottom: 10px;
//           }
//           .listing {
//             background-color: #fff;
//             padding: 20px;
//             margin-bottom: 30px;
//             box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
//             border-radius: 5px;
//           }
//           .info {
//             margin-bottom: 8px;
//             display: flex;
//             justify-content: space-between;
//           }
//           .info label {
//             font-weight: bold;
//             color: #555;
//             flex: 1;
//           }
//           .info span {
//             flex: 2;
//             text-align: right;
//             color: #333;
//           }
//           .car-images img {
//             max-width: 100%;
//             height: auto;
//             border: 1px solid #ddd;
//             padding: 5px;
//             background-color: #f9f9f9;
//             margin-top: 10px;
//             border-radius: 4px;
//           }
//           table {
//             width: 100%;
//             border-collapse: collapse;
//             margin-bottom: 20px;
//           }
//           table, th, td {
//             border: 1px solid #ddd;
//             padding: 8px;
//           }
//           th {
//             background-color: #f2f2f2;
//           }
//           .section {
//             margin-bottom: 40px;
//           }
//           .section-title {
//             font-size: 20px;
//             color: #00aaff;
//             margin-bottom: 10px;
//           }
//           .page-break {
//             page-break-before: always;
//           }
//         </style>
//       </head>
//       <body>
//         <h1>Car Report</h1>
//         <div class="section">
//           <div class="section-title">Information</div>
//           <table>
//             <tr><th>VIN</th><td>${data.marketValueList.vin}</td></tr>
//             <tr><th>Model Year</th><td>${data.marketValueList.modelYear}</td></tr>
//             <tr><th>Make</th><td>${data.marketValueList.make}</td></tr>
//             <tr><th>Model</th><td>${data.marketValueList.model}</td></tr>
//             <tr><th>Trim</th><td>${data.marketValueList.trim}</td></tr>
//             <tr><th>Paint Code</th><td>${data.marketValueList.paintCode}</td></tr>
//             <tr><th>Mileage</th><td>${data.marketValueList.mileage}</td></tr>
//             <tr><th>City</th><td>${data.marketValueList.city}</td></tr>
//             <tr><th>Condition</th><td>${data.marketValueList.condition}</td></tr>
//             <tr><th>Primary Damage</th><td>${data.marketValueList.primaryDamage}</td></tr>
//             <tr><th>Drivable Status</th><td>${data.marketValueList.drivableStatus}</td></tr>
//             <tr><th>Repair Costs</th><td>${data.marketValueList.repairCosts}</td></tr>
//             <tr><th>ACV</th><td>${data.marketValueList.acv}</td></tr>
//             <tr><th>TLV</th><td>${data.marketValueList.tlv}</td></tr>
//             <tr><th>Cost of Repair</th><td>${data.marketValueList.costOfRepair}</td></tr>
//             <tr><th>Total Loss Status</th><td>${data.marketValueList.totalLossStatus}</td></tr>
//           </table>
//         </div>
//         ${data.slectedCars
//           .map(
//             (car, index) => `
//           <div class="page-break"></div>
//           <div class="section listing">
//             <h2>${car.carDetail.year} ${car.carDetail.make} ${car.carDetail.model}</h2>
//             <div class="info"><label>VIN:</label> <span>${car.carDetail.vin}</span></div>
//             <div class="info"><label>Year:</label> <span>${car.carDetail.year}</span></div>
//             <div class="info"><label>Make:</label> <span>${car.carDetail.make}</span></div>
//             <div class="info"><label>Model:</label> <span>${car.carDetail.model}</span></div>
//             <div class="info"><label>Seller Name:</label> <span>${car.carDetail.trim}</span></div>
//             <div class="info"><label>Seller Name:</label> <span>${car.carDetail.mileage}</span></div>
//             <div class="info"><label>Buy Now price:</label> <span>${car.carDetail.price}</span></div>
//             <div class="info"><label>Seller Name:</label> <span>${car.carDetail.dealerName}</span></div>
//             <div class="info"><label>Address:</label> <span>${car.carDetail.dealerName}, ${car.carDetail.city}, ${car.carDetail.state}</span></div>
//           </div>
//         `
//           )
//           .join("")}
//       </body>
//       </html>
//     `;

//     const browser = await chromium.launch();
//     const page = await browser.newPage();
//     await page.setContent(htmlTemplate);
//     const buffer = await page.pdf({ format: "A4" });

//     await browser.close();

//     res.set({
//       "Content-Type": "application/pdf",
//       "Content-Disposition": 'attachment; filename="car_report.pdf"',
//       "Content-Length": buffer.length,
//     });

//     res.send(buffer);
//   } catch (err) {
//     next(err);
//   }
// };
//-------------working code end here-------------------

const generateFreetrialPdf = async (req, res, next) => {
  try {
    const data = req.body;

    const doc = new PDFDocument({ size: PDF.FORMAT, margin: PDF.MARGIN });
    const bufferStream = new stream.PassThrough();

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="car_report.pdf"',
    });

    doc.pipe(bufferStream);
    bufferStream.pipe(res);

    // ------- Report Title -------
    doc.fontSize(PDF.FONT_SIZES.TITLE).font("Helvetica-Bold").fillColor("#000").text("Car Report", { align: "center" });
    doc.moveDown(1.5);

    // ------- Information Section -------
    doc
      .fontSize(PDF.FONT_SIZES.SECTION)
      .font("Helvetica-Bold")
      .fillColor("#000")
      .text("Information", { underline: true });
    doc.moveDown(0.5);

    const infoTable = [
      ["VIN", data.marketValueList.vin],
      ["Model Year", data.marketValueList.modelYear],
      ["Make", data.marketValueList.make],
      ["Model", data.marketValueList.model],
      ["Trim", data.marketValueList.trim],
      ["Paint Code", data.marketValueList.paintCode],
      ["Mileage", data.marketValueList.mileage],
      ["City", data.marketValueList.city],
      ["Condition", data.marketValueList.condition],
      ["Primary Damage", data.marketValueList.primaryDamage],
      ["Drivable Status", data.marketValueList.drivableStatus],
      ["Repair Costs", data.marketValueList.repairCosts],
      ["ACV", data.marketValueList.acv],
      ["TLV", data.marketValueList.tlv],
      ["Cost of Repair", data.marketValueList.costOfRepair],
      ["Total Loss Status", data.marketValueList.totalLossStatus],
    ];

    infoTable.forEach(([label, value]) => {
      const leftX = doc.page.margins.left;
      const rightX = doc.page.width - doc.page.margins.right - 200;
      const y = doc.y;

      doc
        .fontSize(12)
        .font("Helvetica-Bold")
        .fillColor("#000")
        .text(label.toUpperCase(), leftX, y, { width: 200, align: "left" });

      doc
        .fontSize(12)
        .font("Helvetica")
        .fillColor("#444")
        .text(value || "N/A", rightX, y, { width: 200, align: "right" });

      doc.moveDown(0.5);
    });

    // ------- Listings Section -------
    data.slectedCars.forEach((car, index) => {
      doc.addPage();
      doc
        .fontSize(16)
        .font("Helvetica-Bold")
        .fillColor("#000")
        .text(`${car.carDetail.year} ${car.carDetail.make} ${car.carDetail.model}`, { underline: true });
      doc.moveDown(0.5);

      const listing = [
        ["VIN", car.carDetail.vin],
        ["Year", car.carDetail.year],
        ["Make", car.carDetail.make],
        ["Model", car.carDetail.model],
        ["Trim", car.carDetail.trim],
        ["Mileage", car.carDetail.mileage],
        ["Buy Now Price", car.carDetail.price],
        ["Seller Name", car.carDetail.dealerName],
      ];

      listing.forEach(([label, value]) => {
        const leftX = doc.page.margins.left;
        const rightX = doc.page.width - doc.page.margins.right - 200;
        const y = doc.y;

        doc
          .fontSize(12)
          .font("Helvetica-Bold")
          .fillColor("#000")
          .text(label.toUpperCase(), leftX, y, { width: 200, align: "left" });

        doc
          .fontSize(12)
          .font("Helvetica")
          .fillColor("#444")
          .text(value || "N/A", rightX, y, { width: 200, align: "right" });

        doc.moveDown(0.5);
      });

      // ------- Address -------
      doc.moveDown(0.5);
      doc.fontSize(12).font("Helvetica-Bold").fillColor("#000").text("ADDRESS", doc.page.margins.left, doc.y, {
        width: 200,
        align: "left",
      });

      doc
        .font("Helvetica")
        .fillColor("#444")
        .text(
          `${car.carDetail.dealerName || ""}, ${car.carDetail.city || ""}, ${car.carDetail.state || ""}`,
          doc.page.width - doc.page.margins.right - 200,
          doc.y,
          { width: 200, align: "right" },
        );

      doc.moveDown(1);
    });

    doc.end();
  } catch (err) {
    next(err);
  }
};

const generateSalvagePdf = async (req, res, next) => {
  try {
    const data = req.body;

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        error: "Invalid data format. Expected an array of car objects.",
      });
    }

    const template = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Salvage Car Report</title>
        <style> 
            body {
                font-family: 'Helvetica Neue', Arial, sans-serif;
                margin: 0;
                padding: 40px;
                background-color: #f4f4f4;
                color: #333;
                line-height: 1.6;
            }
            h1 {
                font-size: 28px;
                color: #222;
                border-bottom: 2px solid #333;
                padding-bottom: 10px;
                margin-bottom: 20px;
            }
            h2 {
                font-size: 22px;
                color: #444;
                border-left: 4px solid #00aaff;
                padding-left: 10px;
                margin-bottom: 10px;
            }
            .listing {
                background-color: #fff;
                padding: 20px;
                margin-bottom: 30px;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
                border-radius: 5px;
            }
            .info {
                margin-bottom: 8px;
                display: flex;
                justify-content: space-between;
            }
            .info label {
                font-weight: bold;
                color: #555;
                flex: 1;
            }
            .info span {
                flex: 2;
                text-align: right;
                color: #333;
            }
            .dealer-info {
                background-color: #fafafa;
                padding: 20px;
                border: 1px solid #eaeaea;
                border-radius: 5px;
            }
            .dealer-info h2 {
                font-size: 20px;
                margin-bottom: 10px;
                color: #333;
            }
            .dealer-info p {
                margin: 5px 0;
                font-size: 14px;
                color: #555;
            }
            .car-images img {
                max-width: 100%;
                height: auto;
                border: 1px solid #ddd;
                padding: 5px;
                background-color: #f9f9f9;
                margin-top: 10px;
                border-radius: 4px;
            }
        </style>
    </head>
    <body>
      <h1>Salvage Car Report</h1>
      
      ${data
        .map((car) => {
          const roughCondition = car.marketValues?.["market value"]?.find(
            (condition) => condition.Condition === "Rough",
          );
          let auctionPriceArray = [];
          let displayPrice;

          if (Array.isArray(car.auctionData) && car.auctionData.length > 0) {
            auctionPriceArray = car.auctionData.map((item) => {
              const priceString = item.data?.price || "0";
              return parseFloat(priceString.replace(/[$,]/g, ""));
            });
          } else if (typeof car.auctionData === "object" && car.auctionData.data) {
            auctionPriceArray = car.auctionData.data.map((item) => {
              const priceString = item.price || "0";
              return parseFloat(priceString.replace(/[$,]/g, ""));
            });
          }
          const validAuctionPrices = auctionPriceArray.filter((price) => !isNaN(price) && price > 0);

          if (validAuctionPrices.length > 0) {
            displayPrice = Math.max(...validAuctionPrices).toFixed(2);
          } else {
            const privatePartyValue = parseFloat(roughCondition?.["Trade-In"].replace(/[$,]/g, "")) || 0;
            displayPrice = (privatePartyValue - privatePartyValue * 0.83).toFixed(2);
          }

          return `
          <div class="listing">
            <h2>${car.heading || "N/A"}</h2>
            <div class="car-images">
              <img src="${car.media?.photo_links?.[0] || "https://via.placeholder.com/150"}" alt="Car Image" />
            </div>
            <div class="info">
              <label>VIN:</label> <span>${car.vin || "N/A"}</span>
            </div>
            <div class="info">
              <label>Year:</label> <span>${car.build?.year || "N/A"}</span>
            </div>
            <div class="info">
              <label>Make:</label> <span>${car.build?.make || "N/A"}</span>
            </div>
            <div class="info">
              <label>Model:</label> <span>${car.build?.model || "N/A"}</span>
            </div>
            <div class="info">
              <label>Trim:</label> <span>${car.build?.trim || "N/A"}</span>
            </div>
            <div class="info">
              <label>Miles:</label> <span>${car.miles || "N/A"}</span>
            </div>
            <div class="info">
              <label>Exterior Color:</label> <span>${car.exterior_color || "N/A"}</span>
            </div>
            <div class="info">
              <label>Title Type:</label> <span>${car.title_type || "N/A"}</span>
            </div>
            <div class="info">
              <label>Fuel Type:</label> <span>${car.build?.fuel_type || "N/A"}</span>
            </div>
            <div class="info">
                <label>Engine:</label> <span>${car.build?.engine || "N/A"}</span>
            </div>
            <div class="info">
              <label>Transmission:</label> <span>${car.build?.transmission || "N/A"}</span>
            </div>
            <div class="info">
              <label>Drivetrain:</label> <span>${car.build?.drivetrain || "N/A"}</span>
            </div>
            <div class="info">
              <label>Highway MPG:</label> <span>${car.build?.highway_mpg || "N/A"}</span>
            </div>
            <div class="info">
              <label>City MPG:</label> <span>${car.build?.city_mpg || "N/A"}</span>
            </div>
            
            <div class="info">
              <label>Salvage Price:</label>
              <span>$${displayPrice}</span>
            </div>
          </div><br><br><br>
            <div class="dealer-info">
              <h2>Dealer Information</h2>
              <p><strong>Name:</strong> ${car.dealer.name || "N/A"}</p>
              <p><strong>Website:</strong> ${car.dealer.website || "N/A"}</p>
              <p><strong>Location:</strong>${car.dealer.street || "N/A"}, ${car.dealer.city || "N/A"}, ${
            car.dealer.state || "N/A"
          }, ${car.dealer.country || "N/A"}</p>
              <p><strong>Phone:</strong> ${car.dealer.phone || "N/A"}</p>
              <p><strong>Zip:</strong> ${car.dealer.zip || "N/A"}</p>
          </div>
        `;
        })
        .join("")}
    </body>
    </html>
    `;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(template);
    const buffer = await page.pdf({ format: "A4" });

    await browser.close();

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="salvage_car_report.pdf"',
      "Content-Length": buffer.length,
    });

    res.send(buffer);
  } catch (err) {
    console.error("Error generating PDF:", err.message);
    next(err);
  }
};

const homePageApi = async (req, res, next) => {
  try {
    let options = {
      method: "GET",
      url: `https://auto.dev/api/vin/${req.body.vin}?`,
      headers: {
        apiKey: API_KEYS.AUTO_DEV,
      },
    };
    const listing = await axios(options);
    const carByVin = listing.data;

    let baseUrl = `https://auto.dev/api/listings`;
    if (req.body) {
      baseUrl += `?`;
    }

    if (req.body.condition && req.body.condition !== "") {
      baseUrl += `condition=${req.body.condition}`;
    }

    if (req.body.model && req.body.model !== "") {
      const capitalizedModel = req.body.model.charAt(0).toUpperCase() + req.body.model.slice(1);
      baseUrl += `&model=${capitalizedModel}`;
    }

    if (req.body.mileage && req.body.mileage !== "") {
      baseUrl += `&mileage=${req.body.mileage}`;
    }

    if (req.body.modelYear && req.body.modelYear !== "") {
      baseUrl += `&year_max=${req.body.modelYear}`;
    }

    if (req.body.body_style && req.body.body_style !== "") {
      baseUrl += `&body_style=${req.body.body_style}`;
    }

    if (req.body.page && req.body.page !== "") {
      baseUrl += `&page=${req.body.page}`;
    }

    if (req.body.city && req.body.city !== "") {
      baseUrl += `&city=${req.body.city}`;
    }

    if (req.body.trimLevel && req.body.trimLevel !== "") {
      baseUrl += `&trim=${req.body.trimLevel}`;
    }

    if (req.body.make && req.body.make !== "") {
      const makeLength = req.body.make.split(" ");
      if (makeLength.length > 1) {
        let make = makeLength[0].charAt(0).toUpperCase() + makeLength[0].slice(1);
        let model = makeLength[1].charAt(0).toUpperCase() + makeLength[1].slice(1);
        baseUrl += `&make=${make}&model=${model}`;
      } else {
        const capitalizedMake = req.body.make.charAt(0).toUpperCase() + req.body.make.slice(1);
        baseUrl += `&make=${capitalizedMake}`;
      }
    }

    let secondApiCredentials = {
      method: "GET",
      url: baseUrl,
      headers: {
        apiKey: API_KEYS.AUTO_DEV,
      },
    };
    const response = await axios(secondApiCredentials);
    const carListing = response.data;

    return res.status(200).json({
      message: "Car List",
      result: { carListing, carByVin },
    });
  } catch (err) {
    next(err);
  }
};

const getSalvageCarList = async (req, res) => {
  try {
    const response = await axios.get(
      "https://mc-api.marketcheck.com/v2/search/car/auction/active?api_key=PO1xvctFD5uLcQcK6TD3lOtQWXe18ZM9&title_type=salvage&rows=50",
    );

    const car = new Car(response.data);
    await car.save();

    return res.status(200).json({
      message: "Salvage Car List Saved",
      result: response.data,
    });
  } catch (error) {
    return res.status(500).json({ message: "Error fetching and saving car list" });
  }
};

const getSalvageCar = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || PAGINATION.DEFAULT_PAGE_NUMBER;
    const limit = parseInt(req.query.limit, 10) || PAGINATION.DEFAULT_PAGE_SIZE;
    if (page < 1) return res.status(400).json({ message: "Page must be greater than 0" });
    if (limit < 1) return res.status(400).json({ message: "Limit must be greater than 0" });

    const skip = (page - 1) * limit;

    const allCarList = await Car.find().skip(skip).limit(limit);
    const totalCount = await Car.countDocuments();
    const totalPages = Math.ceil(totalCount / limit);

    return res.status(200).json({
      message: "Salvage Car list",
      result: allCarList,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    });
  } catch (err) {
    next(err);
  }
};

const searchSalvageCar = async (req, res) => {
  try {
    const { zip, make, model, year, mileage, trim } = req.query;

    const query = {};

    if (zip) {
      query["listings.dealer.zip"] = zip;
    }

    if (make) {
      query["listings.build.make"] = { $regex: new RegExp(make, "i") };
    }

    if (model) {
      query["listings.build.model"] = { $regex: new RegExp(model, "i") };
    }

    if (year) {
      query["listings.build.year"] = year;
    }

    if (mileage) {
      query["listings.miles"] = { $lte: parseInt(mileage, 10) };
    }

    if (trim) {
      query["listings.build.trim"] = { $regex: new RegExp(trim, "i") };
    }

    const cars = await Car.find(query);

    if (cars.length === 0) {
      return res.status(404).json({ message: "No cars found for the provided parameters" });
    }

    const matchedCars = cars.map((car) => {
      return {
        ...car.toObject(),
        listings: car.listings.filter((listing) => {
          return (
            (!zip || listing.dealer.zip === zip) &&
            (!make || listing.build.make.match(new RegExp(make, "i"))) &&
            (!model || listing.build.model.match(new RegExp(model, "i"))) &&
            (!year || listing.build.year === parseInt(year, 10)) &&
            (!mileage || listing.miles <= parseInt(mileage, 10)) &&
            (!trim || listing.build.trim.match(new RegExp(trim, "i")))
          );
        }),
      };
    });

    return res.status(200).json({
      result: matchedCars,
      message: "Matched cars found",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "An error occurred while searching for cars" });
  }
};

const fetchCarStats = async (req, res) => {
  try {
    const { from_year = SEARCH.MIN_YEAR, to_year = SEARCH.MAX_YEAR, body_type = SEARCH.DEFAULT_BODY_TYPE } = req.query;
    const apiKey = API_KEYS.CAR_STAT;
    const response = await axios.get("https://carstat.dev/api/cars", {
      params: {
        body_type,
        from_year,
        to_year,
      },
      headers: {
        accept: "*/*",
        "x-api-key": apiKey,
      },
    });

    return res.status(200).json(response.data);
  } catch (error) {
    return res.status(error.response?.status || 500).json({
      message: "Failed to fetch car stats",
      error: error.response?.data || error.message,
    });
  }
};

async function getBasePriceForEstimateBid(req, res, next) {
  try {
    const response = await axios.get(`https://auto.dev/api/vin/${req.params.vin}`, {
      headers: {
        apikey: "ZrQEPSkKd2VidGVzdDE5MkBnbWFpbC5jb20=",
      },
    });
    res.json(response.data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

//this is working code end here-------------------

const finalSalvageReport = async (req, res, next) => {
  try {
    const data = req.body;
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        error: "Invalid data format. Expected an array of car objects.",
      });
    }

    const doc = new PDFDocument({ margin: 50 });
    const bufferStream = new stream.PassThrough();

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="salvage_car_report.pdf"',
    });

    doc.pipe(bufferStream);
    bufferStream.pipe(res);

    // --------- Global Report Title ---------
    doc
      .fontSize(PDF.FONT_SIZES.TITLE)
      .font("Helvetica-Bold")
      .fillColor("#000")
      .text("Salvage Car Report", { align: "center" });
    doc.moveDown(1.5);

    data.forEach((car, index) => {
      if (index !== 0) doc.addPage();

      doc
        .fontSize(PDF.FONT_SIZES.SECTION)
        .font("Helvetica-Bold")
        .fillColor("#000")
        .text(car.title || "N/A", { underline: true });
      doc.moveDown(0.5);

      Object.keys(car)
        .filter((key) => {
          return (
            typeof car[key] !== "object" &&
            ![
              "media",
              "latitude",
              "longitude",
              "cylinders",
              "city",
              "state",
              "final_bid_updated_at",
              "eng_name",
              "postal_code",
              "location",
              "is_archived",
              "seller_id",
              "has_bid",
              "buy_now_price",
              "has_images",
              "processed_specs_at",
              "manufacturer_id",
              "model_id",
              "generation_id",
              "body_type",
              "color",
              "engine_id",
              "views",
              "sitemap_id",
              "created_at",
              "updated_at",
              "download_specs_at",
              "engine_volume",
              "lot_id",
              "is_hidden",
              "transmission",
              "vehicle_type",
              "car_id",
              "has_buy_now",
              "distance",
              "fuel",
              "drive_wheel",
            ].includes(key)
          );
        })
        .forEach((key) => {
          const label = key.replace(/_/g, " ").toUpperCase();
          const value = key === "sale_date" ? car[key]?.split("T")[0] : car[key] || "N/A";

          const leftX = doc.page.margins.left;
          const rightX = doc.page.width - doc.page.margins.right - 200;

          const y = doc.y;

          doc
            .fontSize(12)
            .font("Helvetica-Bold")
            .fillColor("#000")
            .text(label, leftX, y, { width: 200, align: "left" });

          doc.fontSize(12).font("Helvetica").fillColor("#444").text(value, rightX, y, { width: 200, align: "right" });

          doc.moveDown(0.5);
        });

      // Address
      doc.moveDown(0.5);
      doc
        .fontSize(PDF.FONT_SIZES.BODY)
        .font("Helvetica-Bold")
        .fillColor("#000")
        .text("ADDRESS", doc.page.margins.left, doc.y, {
          width: 200,
          align: "left",
        });
      doc
        .font("Helvetica")
        .fillColor("#444")
        .text(
          `${car.location || ""}, ${car.city || ""}, ${car.state || ""}, ${car.postal_code || ""}`,
          doc.page.width - doc.page.margins.right - 200,
          doc.y,
          { width: 200, align: "right" },
        );

      doc.moveDown(1);
    });

    doc.end();
  } catch (err) {
    next(err);
  }
};

const finalSalvageReportSinglePdf = async (req, res, next) => {
  try {
    const { market_value, salvage_value } = req.body;

    if (!market_value || !Array.isArray(market_value.selected_car) || !Array.isArray(salvage_value)) {
      return res.status(400).json({
        error: "Invalid data format. Check structure of market_value and salvage_value.",
      });
    }

    const doc = new PDFDocument({ margin: 50 });
    const bufferStream = new stream.PassThrough();

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="car_report.pdf"',
    });

    doc.pipe(bufferStream);
    bufferStream.pipe(res);

    // --------- Report Title ---------
    doc.fontSize(PDF.FONT_SIZES.TITLE).font("Helvetica-Bold").fillColor("#000").text("Car Report", { align: "center" });
    doc.moveDown(2);

    // --------- MARKET VALUE SECTION ---------
    doc.fontSize(18).font("Helvetica-Bold").fillColor("#000").text("Market Value", { underline: true });
    doc.moveDown(1);

    // Market value summary
    const marketSummary = market_value.marketvalue || {};
    Object.entries(marketSummary).forEach(([key, value]) => {
      doc
        .fontSize(PDF.FONT_SIZES.BODY)
        .font("Helvetica-Bold")
        .fillColor("#000")
        .text(key.replace(/_/g, " ").toUpperCase(), { continued: true })
        .font("Helvetica")
        .fillColor("#444")
        .text(`: ${value}`);
    });

    doc.moveDown(1);

    // Market value cars
    market_value.selected_car.forEach((car, index) => {
      if (index !== 0) doc.addPage();

      doc
        .fontSize(PDF.FONT_SIZES.SECTION)
        .font("Helvetica-Bold")
        .fillColor("#000")
        .text(car.title || `Car ${index + 1}`, { underline: true });
      doc.moveDown(0.5);

      renderCarDetails(doc, car);
    });

    // --------- SALVAGE VALUE SECTION ---------
    doc.addPage();
    doc.fontSize(18).font("Helvetica-Bold").fillColor("#000").text("Salvage Value", { underline: true });
    doc.moveDown(1);

    salvage_value.forEach((car, index) => {
      if (index !== 0) doc.addPage();

      doc
        .fontSize(PDF.FONT_SIZES.SECTION)
        .font("Helvetica-Bold")
        .fillColor("#000")
        .text(car.title || `Salvage Car ${index + 1}`, { underline: true });
      doc.moveDown(0.5);

      renderCarDetails(doc, car);
    });

    doc.end();
  } catch (err) {
    next(err);
  }
};

// Helper function to render car details
function renderCarDetails(doc, car) {
  Object.keys(car)
    .filter((key) => {
      return (
        typeof car[key] !== "object" &&
        ![
          "media",
          "latitude",
          "longitude",
          "cylinders",
          "final_bid_updated_at",
          "eng_name",
          "is_archived",
          "seller_id",
          "has_bid",
          "buy_now_price",
          "has_images",
          "processed_specs_at",
          "manufacturer_id",
          "model_id",
          "generation_id",
          "body_type",
          "color",
          "engine_id",
          "views",
          "sitemap_id",
          "created_at",
          "updated_at",
          "download_specs_at",
          "engine_volume",
          "lot_id",
          "is_hidden",
          "transmission",
          "vehicle_type",
          "car_id",
          "has_buy_now",
          "distance",
          "fuel",
          "drive_wheel",
        ].includes(key)
      );
    })
    .forEach((key) => {
      const label = key.replace(/_/g, " ").toUpperCase();
      const value = key === "sale_date" ? car[key]?.split("T")[0] : car[key] || "N/A";

      const leftX = doc.page.margins.left;
      const rightX = doc.page.width - doc.page.margins.right - 200;
      const y = doc.y;

      doc.fontSize(12).font("Helvetica-Bold").fillColor("#000").text(label, leftX, y, { width: 200, align: "left" });

      doc.fontSize(12).font("Helvetica").fillColor("#444").text(value, rightX, y, { width: 200, align: "right" });

      doc.moveDown(0.5);
    });

  // Optional: address
  doc.moveDown(0.5);
  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .fillColor("#000")
    .text("ADDRESS", doc.page.margins.left, doc.y, { width: 200, align: "left" });

  doc
    .font("Helvetica")
    .fillColor("#444")
    .text(
      `${car.location || ""}, ${car.city || ""}, ${car.state || ""}, ${car.postal_code || ""}`,
      doc.page.width - doc.page.margins.right - 200,
      doc.y,
      { width: 200, align: "right" },
    );

  doc.moveDown(1);
}
//working code end--------------

const finalSalvageReportNewVersion = async (req, res, next) => {
  try {
    const { marketvalue, salvage_value } = req.body;

    if (
      !marketvalue ||
      !Array.isArray(marketvalue.selected_car) ||
      !salvage_value ||
      !Array.isArray(salvage_value.salvageCars)
    ) {
      return res.status(400).json({
        error: "Invalid data format. Check structure of marketvalue and salvage_value.",
      });
    }

    const doc = new PDFDocument({ margin: PDF.MARGIN });
    const bufferStream = new stream.PassThrough();

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="car_report.pdf"',
    });

    doc.pipe(bufferStream);
    bufferStream.pipe(res);

    // --------- Report Title ---------
    doc.fontSize(PDF.FONT_SIZES.TITLE).font("Helvetica-Bold").fillColor("#000").text("Car Report", { align: "center" });
    doc.moveDown(2);

    // --------- MARKET VALUE SECTION ---------
    doc.fontSize(18).font("Helvetica-Bold").fillColor("#000").text("Market Value", { underline: true });
    doc.moveDown(1);
    const marketSummary = marketvalue.marketvalue || {};
    const marketInfoTable = [
      ["VIN", marketSummary.vin],
      ["Model Year", marketSummary.modelYear],
      ["Make", marketSummary.make],
      ["Model", marketSummary.model],
      ["Trim", marketSummary.trim],
      ["Paint Code", marketSummary.paintCode],
      ["Mileage", marketSummary.mileage],
      ["City", marketSummary.city],
      ["Condition", marketSummary.condition],
      ["Primary Damage", marketSummary.primaryDamage],
      ["Drivable Status", marketSummary.drivableStatus],
      ["Repair Costs", marketSummary.repairCosts],
      ["ACV", marketSummary.acv],
      ["TLV", marketSummary.tlv],
      ["Cost of Repair", marketSummary.costOfRepair],
      ["Total Loss Status", marketSummary.totalLossStatus],
    ];
    marketInfoTable.forEach(([label, value]) => {
      const leftX = doc.page.margins.left;
      const rightX = doc.page.width - doc.page.margins.right - 200;
      const y = doc.y;
      doc
        .fontSize(PDF.FONT_SIZES.BODY)
        .font("Helvetica-Bold")
        .fillColor("#000")
        .text(label.toUpperCase(), leftX, y, { width: 200, align: "left" });
      doc
        .fontSize(PDF.FONT_SIZES.BODY)
        .font("Helvetica")
        .fillColor("#444")
        .text(value || "N/A", rightX, y, { width: 200, align: "right" });
      doc.moveDown(0.5);
    });
    doc.moveDown(1);
    // ------- Selected Cars Section -------
    for (let index = 0; index < marketvalue.selected_car.length; index++) {
      const car = marketvalue.selected_car[index];
      if (index !== 0) doc.addPage();
      doc
        .fontSize(16)
        .font("Helvetica-Bold")
        .fillColor("#000")
        .text(`${car.carDetail.year || ""} ${car.carDetail.make || ""} ${car.carDetail.model || ""}`, {
          underline: true,
        });
      doc.moveDown(0.5);
      const detail = car.carDetail || {};
      const tracking = detail.trackingParams || {};
      const city = detail.city || "";
      const state = detail.state || "";
      const zip = detail.zip || "";
      const address = detail.address || [tracking.dealerName, city, state, zip].filter(Boolean).join(", ");
      const listing = [
        ["VIN", detail.vin],
        ["Year", detail.year],
        ["Make", detail.make],
        ["Model", detail.model],
        ["Trim", car.overView?.years?.[0]?.styles?.[0]?.trim],
        ["Mileage", detail.mileage],
        ["Buy Now Price", detail.price],
        ["Seller Name", tracking.dealerName],
        ["Address", address],
      ];
      listing.forEach(([label, value]) => {
        const leftX = doc.page.margins.left;
        const rightX = doc.page.width - doc.page.margins.right - 200;
        const y = doc.y;
        doc
          .fontSize(PDF.FONT_SIZES.BODY)
          .font("Helvetica-Bold")
          .fillColor("#000")
          .text(label.toUpperCase(), leftX, y, { width: 200, align: "left" });
        doc
          .fontSize(PDF.FONT_SIZES.BODY)
          .font("Helvetica")
          .fillColor("#444")
          .text(value || "N/A", rightX, y, { width: 200, align: "right" });
        doc.moveDown(0.5);
      });

      doc.moveDown(1); // No estimateBidValue here
    }

    // --------- SALVAGE VALUE SECTION ---------
    doc.addPage();
    doc.fontSize(18).font("Helvetica-Bold").fillColor("#000").text("Salvage Value", { underline: true });
    doc.moveDown(1);

    for (let index = 0; index < salvage_value.salvageCars.length; index++) {
      const car = salvage_value.salvageCars[index];
      if (index !== 0) doc.addPage();

      doc
        .fontSize(PDF.FONT_SIZES.SECTION)
        .font("Helvetica-Bold")
        .fillColor("#000")
        .text(car.title || `Salvage Car ${index + 1}`, { underline: true });
      doc.moveDown(0.5);

      renderCarDetails(doc, car);

      // Only here we run getBaseMsrp
      if (car.bid == null || car.bid === undefined) {
        const baseMsrp = await getBaseMsrp(car.vin);
        if (!baseMsrp) {
          doc
            .fontSize(12)
            .font("Helvetica-Oblique")
            .fillColor("red")
            .text("There is no record of salvaged cars sold that match this year, make and model", { align: "left" });
        } else {
          const estimateBidValue = baseMsrp * 0.2;
          const leftX = doc.page.margins.left;
          const rightX = doc.page.width - doc.page.margins.right - 200;
          const y = doc.y;

          doc
            .fontSize(12)
            .font("Helvetica-Bold")
            .fillColor("#000")
            .text("ESTIMATE BID VALUE", leftX, y, { width: 200, align: "left" });

          doc
            .fontSize(12)
            .font("Helvetica")
            .fillColor("#444")
            .text(`$${estimateBidValue.toFixed(2)}`, rightX, y, { width: 200, align: "right" });

          doc.moveDown(0.5);
        }
        doc.moveDown(1);
      } else {
        doc.moveDown(1);
      }
    }

    doc.end();
  } catch (err) {
    next(err);
  }
};

const checkZipCode = async (req, res, next) => {
  try {
    const response = await axios.get(`https://auto.dev/api/zip/${req.params.zip}`);
    res.status(200).json(response.data);
  } catch (err) {
    next(err);
  }
};

const getMakes = async (req, res) => {
  const searchTerm = req.query.search || "";

  try {
    const query = `SELECT 
          id, name,
          CASE 
          WHEN cars_qty > ${MANUFACTURERS.POPULAR_THRESHOLD} THEN 'popular' 
          ELSE 'AllMakes' 
          END AS category
          FROM manufacturers
          WHERE name ILIKE :searchTerm order by name asc`;
    const [makes, metadata] = await sequelize.query(query, {
      replacements: { searchTerm: `%${searchTerm}%` },
    });
    res.status(200).json(makes);
  } catch (error) {
    console.error("Error fetching makes:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getModels = async (req, res) => {
  const { makeId } = req.params;
  const searchTerm = req.query.search || "";

  try {
    const [models, metadata] = await sequelize.query(
      "SELECT id, name FROM models WHERE manufacturer_id = :makeId AND name ILIKE :searchTerm AND vehicle_type = 1 order by name asc",
      {
        replacements: { makeId, searchTerm: `%${searchTerm}%` },
      },
    );

    if (models.length === 0) {
      return res.status(404).json({ message: "No models found for this make" });
    }

    res.status(200).json(models);
  } catch (error) {
    console.error("Error fetching models:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
const getDefaults = async (req, res) => {
  try {
    console.log(DEFAULT_CAR_VALUES, "DEFAULT_CAR_VALUESDEFAULT_CAR_VALUES");
    res.status(200).json({ DEFAULT_CAR_VALUES });
  } catch (err) {
    console.error("Error fetching models:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

process.on("SIGINT", async () => {
  if (browser) await browser.close();
  process.exit();
});

module.exports = {
  carMarketValue,
  carinfoByVin,
  carListing,
  saleHistory,
  carFilteraton,
  auction,
  premiumVinDecode,
  marketValuebyVin,
  marketValuebyYearAndModel,
  vehicleRepair,
  vehicleWarranty,
  premiumPlusVinDecode,
  marketValue,
  generateReport,
  generateFreetrialPdf,
  homePageApi,
  getSalvageCarList,
  generateSalvagePdf,
  searchSalvageCar,
  getSalvageCar,
  salvageCarListbyPost,
  finalSalvageReport,
  fetchCarStats,
  marketingValueCarListbypostforradius,
  getBasePriceForEstimateBid,
  finalSalvageReportSinglePdf,
  finalSalvageReportNewVersion2,
  checkZipCode,
  getMakes,
  getModels,
  getDefaults,
};

function normalize(str) {
  return str.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function findMatchingModel(input, models) {
  const normalizedInput = normalize(input);
  return models.find((model) => normalize(model.name) === normalizedInput);
}

async function getBaseMsrp(vin) {
  try {
    const response = await axios.get(`https://auto.dev/api/vin/${vin}`, {
      headers: {
        Authorization: `${process.env.AUTO_DEV_KEY}`,
      },
    });

    return response?.data?.price?.baseMsrp;
  } catch (error) {
    console.error("VIN Lookup Error:", error.message);
    // res.status(500).json({ error: 'Failed to fetch VIN data' });
  }
}

async function finalSalvageReportNewVersion2(req, res, next) {
  try {
    const { marketvalue, salvage_value } = req.body;

    if (
      !marketvalue ||
      !Array.isArray(marketvalue.selected_car) ||
      !salvage_value ||
      !Array.isArray(salvage_value.salvageCars)
    ) {
      return res.status(400).json({
        error: "Invalid data format. Check structure of marketvalue and salvage_value.",
      });
    }

    const doc = new PDFDocument({ margin: PDF2.MARGIN });
    const bufferStream = new stream.PassThrough();

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="car_report.pdf"',
    });

    doc.pipe(bufferStream);
    bufferStream.pipe(res);

    // --------- Title ---------
    const logoUrl = "https://carappraiser.appraiser-assistant.com/icon1.png"; // Replace with your image URL
    const logoWidth = 80;
    const logoHeight = 50;
    const leftX = doc.page.margins.left;
    const topY = doc.y;
    try {
      const response = await axios.get(logoUrl, { responseType: "arraybuffer" });
      const logoBuffer = Buffer.from(response.data, "binary");

      // Draw logo on the left
      doc.image(logoBuffer, leftX, topY, {
        width: logoWidth,
        height: logoHeight,
      });

      // Text right next to the logo
      doc
        .fontSize(16)
        .font("Helvetica-Bold")
        .fillColor("#1a2c56") // Dark blue
        .text("Auto Appraiser", leftX + logoWidth + 10, topY + 5);

      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .text("Assistant", leftX + logoWidth + 10, topY + 22);
    } catch (err) {
      doc.fontSize(12).fillColor("red").text("Logo failed to load", leftX, topY);
    }

    // Right side text
    const rightX = doc.page.width - doc.page.margins.right - 200;

    doc.fontSize(12).font("Helvetica-Bold").fillColor("#000").text("Conditions Report", rightX, topY, {
      width: 200,
      align: "right",
    });

    doc
      .font("Helvetica-Oblique")
      .fontSize(10)
      .fillColor("#444")
      .text(`Dated: ${new Date().toLocaleDateString()}`, rightX, topY + 16, {
        width: 200,
        align: "right",
      });

    // Add spacing after header
    doc.moveDown(5);
    doc.x = doc.page.margins.left;

    // --------- Market Summary ---------
    doc.fontSize(18).font("Helvetica-Bold").text("Original Damaged Vehicle", { underline: true, align: "center" });
    doc.moveDown(1);

    const summary = marketvalue.marketvalue || {};
    const summaryFields = [
      ["VIN", summary.vin],
      ["Model Year", summary.modelYear],
      ["Make", summary.make],
      ["Model", summary.model],
      ["Trim", summary.trim],
      ["Paint Code", summary.paintCode],
      ["Mileage", summary.mileage],
      ["City", summary.city],
      ["Condition", summary.condition],
      ["Primary Damage", summary.primaryDamage],
      ["Drivable Status", summary.drivableStatus],
      // ["Repair Costs", summary.repairCosts],
      ["ACV", summary.acv],
      // ["TLV", summary.tlv],
      ["Cost of Repair", summary.costOfRepair],
      ["Total Loss Status", summary.totalLossStatus],
    ];

    summaryFields.forEach(([label, value]) => {
      const leftX = doc.page.margins.left;
      const rightX = doc.page.width - doc.page.margins.right - 200;
      const y = doc.y;
      doc.fontSize(PDF2.FONT_SIZES.BODY).font("Helvetica-Bold").text(label.toUpperCase(), leftX, y, {
        width: 200,
        align: "left",
      });
      doc
        .font("Helvetica")
        .fillColor("#444")
        .text(value || "N/A", rightX, y, {
          width: 200,
          align: "right",
        });
      doc.moveDown(0.5);
    });

    doc.moveDown(9);

    professionalDisclosure(doc);

    // --------- Selected Cars Grid ---------
    doc.addPage();
    doc.fontSize(18).font("Helvetica-Bold").text("Market Value Survey", { align: "center" });
    doc.moveDown(1);

    let startY = doc.y;
    for (let i = 0; i < marketvalue.selected_car.length; i++) {
      const x = getCardX(i);
      const row = Math.floor(i / CARDS_PER_ROW);
      let y = getCardY(startY, row);

      if (i > 0 && i % (CARDS_PER_ROW * 3) === 0) {
        doc.addPage();
        startY = doc.y;
      }
      if (marketvalue.selected_car.length > 3 && i == 3) {
        doc.addPage();
        y = 16;
      }
      await renderCarCard(doc, marketvalue.selected_car[i], x, y, false);
    }

    // if(marketvalue.selected_car.length < 4){
    //   doc.moveDown(24)
    //   professionalDisclosure(doc)
    // }
    // --------- Salvage Cars Grid ---------
    doc.addPage();
    doc.fontSize(18).font("Helvetica-Bold").text("Salvage Value Bids", { align: "center" });
    doc.moveDown(1);

    startY = doc.y;
    for (let i = 0; i < salvage_value.salvageCars.length; i++) {
      const x = getCardX(i);
      const row = Math.floor(i / CARDS_PER_ROW);
      let y = getCardY(startY, row);

      if (i > 0 && i % (CARDS_PER_ROW * 3) === 0) {
        doc.addPage();
        startY = doc.y;
      }
      if (salvage_value.salvageCars.length > 3 && i == 3) {
        doc.addPage();
        doc.fontSize(18).font("Helvetica-Bold").text("Salvage Value Bids", { align: "center" });
        y = 16;
      }
      await renderCarCard(doc, salvage_value.salvageCars[i], x, y, true);

      if (salvage_value.salvageCars[i].bid == null) {
        const baseMsrp = await getBaseMsrp(salvage_value.salvageCars[i].vin);
        if (baseMsrp) {
          const estimate = baseMsrp * 0.2;
          doc
            .fontSize(10)
            .fillColor("#000")
            .text("Estimated Bid: ", x, y + CARD_HEIGHT - 20);
          doc
            .fontSize(10)
            .fillColor("#444")
            .text(`$${estimate.toFixed(2)}`, x + 100, y + CARD_HEIGHT - 20);
        } else {
          doc
            .fontSize(10)
            .fillColor("red")
            .text("No base MSRP found", x, y + CARD_HEIGHT - 20);
        }
      }
    }
    // if (salvage_value.salvageCars.length < 4) {
    doc.moveDown(20);
    // professionalDisclosure(doc)
    // }
    doc.end();
  } catch (err) {
    next(err);
  }
}

function professionalDisclosure(doc) {
  doc
    .fontSize(10)
    .font("Helvetica")
    .fillColor("#444")
    .text("Professional Disclosure", doc.page.margins.left, doc.y, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      align: "left",
    });

  doc.moveDown(0.5); // Small space after heading

  const disclosureText = `This report incorporates reference materials that utilize data from the Insurance Auto Auctions (IAA) and CoPart auction platforms. The information derived from these sources is intended for informational purposes only and should be verified independently by users.`;
  const disclosureText2 = `While the data is derived from reputable sources, no guarantees are made regarding the accuracy, completeness, or timeliness of the information presented.`;
  const disclosureText3 = `Users are encouraged to conduct their own due diligence and consult additional resources as necessary.`;

  doc
    .fontSize(10)
    .font("Helvetica")
    .fillColor("#444")
    .text(disclosureText, doc.page.margins.left, doc.y, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      align: "left",
      lineGap: 4,
    });

  doc.moveDown(0.5);

  doc
    .fontSize(10)
    .font("Helvetica")
    .fillColor("#444")
    .text(disclosureText2, doc.page.margins.left, doc.y, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      align: "left",
      lineGap: 4,
    });

  doc.moveDown(0.5);

  doc
    .fontSize(10)
    .font("Helvetica")
    .fillColor("#444")
    .text(disclosureText3, doc.page.margins.left, doc.y, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      align: "left",
      lineGap: 4,
    });

  doc.moveDown(1);
}

function getCardX(index) {
  return PDF.MARGIN + (index % CARDS_PER_ROW) * (CARD_WIDTH + GAP);
}

function getCardY(startY, rowIndex) {
  const EXTRA_GAP_AFTER_FIRST_ROW = 40;
  const extra = rowIndex > 0 ? EXTRA_GAP_AFTER_FIRST_ROW : 0;
  return startY + rowIndex * (CARD_HEIGHT + GAP) + extra;
}

async function renderCarCard(doc, car, x, y, isSalvage = false) {
  try {
    const imgUrl = isSalvage ? JSON.parse(car.images?.[0])?.[0] : car.carDetail?.thumbnailUrlLarge;

    if (imgUrl) {
      const response = await axios.get(imgUrl, {
        responseType: "arraybuffer",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
          Referer: "https://cars.import-motor.com/",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "keep-alive",
        },
      });
      let buffer = Buffer.from(response.data, "binary");

      if (isSalvage && imgUrl.endsWith(".webp")) {
        buffer = await sharp(buffer).jpeg().toBuffer();
      }

      doc.image(buffer, x, y, { fit: [CARD_WIDTH, IMAGE_HEIGHT] });
    } else {
      doc.fontSize(10).fillColor("red").text("No Image", x, y);
    }
  } catch (err) {
    doc.fontSize(10).fillColor("red").text("Image Error", x, y);
  }

  const title = isSalvage
    ? car.title || `${car.year || ""} ${car.manufacturer || ""} ${car.model || ""}`
    : `${car.carDetail?.year || ""} ${car.carDetail?.make || ""} ${car.carDetail?.model || ""}`;

  const bid = isSalvage ? `Final Bid: $${car.bid ?? "N/A"}` : `Price: ${car.carDetail?.price ?? "N/A"}`;

  const info = isSalvage
    ? [
        ["VIN", car.vin?.toUpperCase()],
        ["Year", car.year],
        ["Make", car.manufacturer],
        ["Model", car.model],
        ["Mileage", car.mileage],
        ["Dealer Name", car.seller_name],
        ["Address", `${car.city || ""}, ${car.state || ""}`],
        ["Source", car.domain_id == 1 ? "IAA" : car.domain_id == 3 ? "Copart" : "-"],
      ]
    : [
        ["VIN", car.carDetail?.vin],
        ["Year", car.carDetail?.year],
        ["Make", car.carDetail?.make],
        ["Model", car.carDetail?.model],
        ["Trim", car.carDetail?.trim],
        ["Mileage", car.carDetail?.mileage],
        ["Dealer Name", car.carDetail?.trackingParams?.dealerName || car.carDetail?.dealerName],
        ["Address", `${car.carDetail?.city || ""}, ${car.carDetail?.state || ""}`],
      ];

  dy = y + IMAGE_HEIGHT + 5;
  doc.fontSize(10).font("Helvetica-Bold").fillColor("#000");

  const titleHeight = doc.heightOfString(title, {
    width: CARD_WIDTH,
    align: "left",
  });

  doc.text(title, x, dy, {
    width: CARD_WIDTH,
    align: "left",
    lineBreak: true,
  });

  dy += titleHeight + 5;
  doc.font("Helvetica").text(bid, x, dy, {
    width: CARD_WIDTH,
    align: "left",
  });

  // line break;
  dy += 20;

  const linePadding = 0;
  doc
    .moveTo(x + linePadding, dy)
    .lineTo(x + CARD_WIDTH - linePadding, dy)
    .lineWidth(0.5)
    .strokeColor("#888")
    .stroke();
  // dy += 10;

  dy += 20;

  info.forEach(([label, value]) => {
    if (!value) return;

    doc.fontSize(8).font("Helvetica-Bold").fillColor("#000").text(label, x, dy, {
      width: CARD_WIDTH,
      align: "left",
    });
    dy += 10;

    doc.font("Helvetica").fillColor("#444").text(String(value), x, dy, {
      width: CARD_WIDTH,
      align: "left",
    });
    dy += 14; // More spacing to separate field sets
  });
}

function isPrice(str) {
  const pattern = /^\$\d{1,3}(,\d{3})*(\.\d{2})?$/;
  return pattern.test(str.trim());
}
