import type { ConstructorStanding, DriverStanding, Standings } from "@pitwall/shared";

const mercedes = { id: "mercedes", name: "Mercedes", nationality: "German", url: null };
const ferrari = { id: "ferrari", name: "Ferrari", nationality: "Italian", url: null };
const driver = (id: string, code: string, givenName: string, familyName: string, number: number) => ({
  id, code, number, givenName, familyName, nationality: null, dateOfBirth: null, url: null,
});

export const driverStandings = (season: number): Standings<DriverStanding> => ({
  season,
  round: 3,
  entries: [
    { position: 1, positionText: "1", points: 68, wins: 2, driver: driver("antonelli", "ANT", "Andrea Kimi", "Antonelli", 12), constructors: [mercedes] },
    { position: 2, positionText: "2", points: 50.5, wins: 1, driver: driver("leclerc", "LEC", "Charles", "Leclerc", 16), constructors: [ferrari] },
    { position: 3, positionText: "3", points: 40, wins: 0, driver: driver("russell", "RUS", "George", "Russell", 63), constructors: [mercedes] },
  ],
});

export const constructorStandings = (season: number): Standings<ConstructorStanding> => ({
  season,
  round: 3,
  entries: [{ position: 1, positionText: "1", points: 108, wins: 2, constructor: mercedes }],
});
