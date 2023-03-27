const express = require('express')
const path = require('path')
const app = express()
const cors = require('cors')
const PORT = process.env.PORT || 3000;

const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

require('dotenv').config()
const JWT_SECRET = 'jifjwogjeiwjgowigjweoigjweoijoei';

// POSTGRES ATTEMPT

const { Pool, Client } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
})

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized:false
    }
  })
  try {
    client.connect()
    console.log('Successfully connected to postgres database')    
  } catch (error) {
    console.log('Error - database connection failed:', error)
  }

// Client -> Server : Your client * somehow * as to authenticate who it is
// Why -> Server is a central computer YOU control 
// Client-> a computer you do not control - how can client prove to server it is who they say they are?

// 1. Client proves itself somehow on the request (JWT)
// 2. Client-Server share a secret (Cookie)

// SOCKET IO TIME 

const corsOptions = {
    origin: '*',
    credentials: true,
    optionSuccessStatus: 200,
}

app.use('/', express.static(path.join(__dirname, 'static')))
app.use(express.json());
app.use(cors(corsOptions));

app.post('/api/create', async (req, res) => {
    console.log('this is what we get', req.body);
    let playerArray = req.body.array;
    let password = req.body.password;
    console.log(playerArray);
    console.log(password);

    const text2 = `UPDATE ratings SET current_week=false WHERE current_week=true`;
    client.query(text2, (err, res) => {
        if(err){
            console.log(err.stack);
        } else {
            console.log(res);
        }
    })

    //POSTGRES ATTEMPTS 
    // CREATE POSTGRESQL TABLE - with Name values filled in and ratings empty 
    for (let i = 0; i < playerArray.length; i++) {
        const text = 'INSERT INTO test_ratings(name, password) VALUES($1, $2) RETURNING *'
        const values = [playerArray[i], password]
        client.query(text, values, (err, res) => {
            if(err){
                console.log(err.stack);
            } else {
                console.log(res.rows[0]);
            }
        })        
    }

    res.json({ status: 'ok' })
})

// Unique Poll Room - for 14 players to vote
app.post('/api/entry', async (req, res) => {
    console.log(req.body);
    let receivedPassword = req.body.enteredPassword;
    console.log(receivedPassword);

    const query1 = `SELECT * FROM ratings WHERE password = '${receivedPassword}'`
    client.query(query1, (err, result) => {
        if(err){
            console.log(err.stack);
            res.json({status: 'error'});
        } else {
            if(result.rowCount == 0){
                res.json({status: 'error', message: 'There was an error with the SQL query'})
            } else if( result.rows[0].rating14 != null){
                res.json({status: 'Error14', message: '14 votes already in for this week!'})
            } else {
                const query2 = `SELECT name FROM ratings WHERE password = '${receivedPassword}'`
                client.query(query2, (err, result) => {
                    if(err){
                        console.log(err.stack);
                    } else {
                        res.json({status: "ok", result: result})
                    }
                })
            }
        }
    })
})


// RATING BASED ON PASSWORD FOR THAT WEEK 
app.post('/api/rate/:password', async (req, res) => {
    try {  
            let ratingsArray = req.body.array;
            const password = req.params.password;
            console.log("this is password from url", password)
            console.log("this is the array we received", ratingsArray);

            for (let i = 0; i < ratingsArray.length; i++) { 
                // INSERT RATING INTO TABLE FOR THAT PLAYER WITH NAME..
                function checkNullRow(selectedPlayer){
                    try {
                        let nullKey = Object.keys(selectedPlayer).find(key => selectedPlayer[key] === null)
                        if(nullKey == 'avg_rating' || nullKey == undefined){
                            console.log('sorry ratings full!');
                            throw '14 ratings already in!';
                        } else {
                          return nullKey;
                        }
                    } catch (error) {
                        console.log('from inner try catch', error);
                    }
                  
                }

                // How do we know which rating to set? - WE CALL THE ABOVE FUNCTION THAT LOOPS THROUGH OBJECT AND FINDS FIRST NULL VALUE 
                const query1 = 'SELECT * FROM test_ratings WHERE name=$1 AND password=$2'
                const values1 = [`${ratingsArray[i].name}`, password]
                client.query(query1, values1, (err, res) => {
                    if(err){
                        console.log(err.stack);
                    } else {
                        // console.log(res.rows[0])
                        let selectedPlayer = res.rows[0];
                        // console.log('why is this an ARRAY??:', selectedPlayer);
                        let emptyColumn = checkNullRow(selectedPlayer);
                        console.log('we got this far', emptyColumn);

                        let columnNumber = emptyColumn.replace(/\D+/g, '');
                        console.log('COLUMN NUMBER???' + columnNumber);
                        let emptyUserColumn = `user${columnNumber}`;
                        console.log('EMPTY USER COLUMN?' + emptyUserColumn);
                        console.log('IS THIS THY USERname: ', ratingsArray[i].user);

                        const query2 = `UPDATE test_ratings SET ${emptyColumn}=${ratingsArray[i].rating}, ${emptyUserColumn}='${ratingsArray[i].user}' WHERE name=$1 AND password=$2 RETURNING *`
                        const values2 = [`${ratingsArray[i].name}`, password]
                        client.query(query2, values2, (err, res) => {
                            if(err){
                                console.log(err.stack);
                            } else {
                                // console.log(res);
                                // console.log('new')
                            }
                        })

                        // THE avg_rating column needs to be updated every time a new rating comes in
                        // To do that we need to select all columns for a given name and calculate the average excluding null values
                        // We then take that calculated avg_rating and set it in the avg_rating column 

                        // const query3 = `SELECT (rating1, rating2, rating3, rating4, rating5, rating6, rating7, rating8, rating9, rating10, rating11, rating12, rating13, rating14) from ratings WHERE name=$1 AND password=$2`
                        // We run the above query as 14 separate queries by using a loop - after each query we add the float to an array and then we get our avg_rating from that array and push it to the db. 
                        let playerFloatArray = [];
                        let sum_value = 0;
                        for (let h = 1; h <= 14; h++) {
                            const query3 = `SELECT (rating${h}) from test_ratings WHERE name=$1 AND password=$2`
                            client.query(query3, values2, (err, res) => {
                                if(err){
                                    console.log(err.stack);
                                } else {
                                    // console.log('HOW DOES THIS CUM', res)
                                    // console.log(Object.values(res.rows[0])[0]);
                                    sum_value += Object.values(res.rows[0])[0];
                                    if(Object.values(res.rows[0])[0] !== null){
                                        playerFloatArray.push(Object.values(res.rows[0])[0]);
                                    }
                                    // I loop through 14 but not all 14 will be filled out instantly 
                                    // Check if(value !== null or undefined or '') and then add to sum value
                                    // Once this finished running call function to update avg rating 

                                    if (h == 14){
                                        let fixed_avg_rating = (sum_value / playerFloatArray.length).toFixed(1);
                                        // console.log('FIXED_AVG_RATING', fixed_avg_rating);
                                            
                                        const query4 = `UPDATE test_ratings SET avg_rating=$1 WHERE name=$2 AND password=$3 RETURNING *`
                                        const values4 = [fixed_avg_rating, `${ratingsArray[i].name}`, password]
                                        client.query(query4, values4, (err, res) => {
                                            if(err){
                                                // console.log(err.stack);
                                            } else {
                                    
                                            }
                                        })

                                        // saveAvgRating(fixed_avg_rating);
                                    }
                                    // So row is an array of strings - so I can loop through it and try to convert each element to a number 
                                    // If successful add number to number array otherwise continue 
    
                                    // let stringRatings = res.rows[0].row;
                                    // let stringRatingsRegex = stringRatings.replace(/\D/g,'');
                                    // console.log('STRING RATINGS', stringRatings);
                                    // console.log('STRING RATINGS REGEX', stringRatingsRegex);
                                    // console.log('this is stringRatings:' , stringRatings)
                                    // let currentRatingArray = [];
                                    // let sum = 0;
                                    // let avg;
                                    // for (let j = 0; j < stringRatingsRegex.length; j++) {
                                    //         currentRatingArray[j] = parseFloat(stringRatingsRegex[j]);
                                    //         sum += currentRatingArray[j]
                                    // }
    
                                    
                                    // console.log(' WHATS THIS SAYING' , currentRatingArray);
                                    
                                    // avg = sum/currentRatingArray.length;
                                    // avg_1_dp = avg.toFixed(1);
                                    // // console.log('this is the current average rating:', avg_1_dp)
    
    
                                    // const query4 = `UPDATE ratings SET avg_rating=$1 WHERE name=$2 AND password=$3 RETURNING *`
                                    // const values4 = [avg_1_dp, `${ratingsArray[i].name}`, password]
                                    // client.query(query4, values4, (err, res) => {
                                    //     if(err){
                                    //         console.log(err.stack);
                                    //     } else {
                                    //         // console.log("result of setting avg_rating:", res);
                                    //     }
                                    // })
            
    
                                    // ** ATTENTION ** - The issue above is that we have no error handling for when 14 votes are in 
                                    // We need to return and error saying voting full - but when we do that we get a set headers problem
                                    // We do the check for null so at least avg_Rating should be filled with a normal rating value 
                                    // Convert String array to Number array 
    
    
    
                                    // TO SEPARATE THESE QUERIES WE WRAP THEM AROUND FUNCTIONS 
                                    // They call on eachother passing the values requried from each query 
                                
                                }
                            })   
                        }
                    }
                })
        }
        res.json({status: 'ok'})
    } catch (error) {
        console.log(error);
        res.json({status: 'error'})
    }
})


// GENERATE LEADERBOARD 

app.get('/api/leaderboard', async (req, res) => {
    // Selects distinct names so we get a list with every player that has ever played
    const query1 = `SELECT DISTINCT (name) FROM ratings`
    client.query(query1, (err, result1) => {
        if(err){
            console.log(err.stack);
        } else {
            console.log(result1);
            if(result1.rowCount == 0){
                res.json({status: 'error'})
            } else {
            let uniqueNameArray = [];
            let overallRatingArray = [];
            let queryResult = result1.rows;
            console.log('UNIQUE LIST OF NAMES:', queryResult);
            for (let i = 0; i < queryResult.length; i++) {
                uniqueNameArray[i] = queryResult[i].name;
                
                // COMPUTE OVERALL RATING 
                const query2 = `SELECT avg_rating, windrawloss, name FROM ratings WHERE name=$1`
                const values2 = [uniqueNameArray[i]]
                client.query(query2, values2, (err, result2) => {
                    if(err){
                        console.log(err.stack)
                    } else {
                        let secondQueryResult = result2.rows;
                        console.log('IS THIS THE RESULT:', result2.rows);
                        let sum = 0;
                        let wins = 0;
                        let draws = 0;
                        let losses = 0
                        for (let j = 0; j < secondQueryResult.length; j++) {
                            sum += secondQueryResult[j].avg_rating
                            if(secondQueryResult[j].windrawloss == 'win'){
                                wins++;
                            }
                            else if(secondQueryResult[j].windrawloss == 'loss'){
                                losses++;
                            }
                            else if(secondQueryResult[j].windrawloss == 'draw'){
                                draws++;
                            }
                        }

                        let overall_avg = sum/secondQueryResult.length;
                        console.log('WTF IS HERE', overall_avg)
                        let overall_avg_1dp = overall_avg.toFixed(1);
                        console.log('THERES NO WAY', overall_avg_1dp);

                         // OBTAIN NUMBER OF MATCHES PLAYED 
                        const query3 = `SELECT COUNT(DISTINCT(password)) FROM ratings WHERE name=$1`
                        const values3 = [uniqueNameArray[i]]
                        client.query(query3, values3, (err, result3) => {
                            if(err){
                                console.log(err.stack)
                            } else {
                                let thirdQueryResult = result3.rows;
                                console.log('DISTINCT RESULT:', thirdQueryResult);
                                console.log(thirdQueryResult[0].count)
                                let matches_played = parseInt(thirdQueryResult[0].count);   
                                console.log('WHAT IS THIS VALUE HERE', overall_avg_1dp)
                                let resultObject = { 'name': uniqueNameArray[i], 'overall_rating': overall_avg_1dp, 'matches_played': matches_played, 'wins': wins, 'losses': losses, 'draws': draws }
                                overallRatingArray.push(resultObject);
                                console.log('OVERALL RATING ARRAY', overallRatingArray)
                                console.log('RESULT OBJECT:', resultObject)

                                
                                if(i == result1.rows.length - 1){
                                    console.log('OVERALL RAITNG ARRAY', overallRatingArray)
                                    res.json( { status: 'ok', array: overallRatingArray })
                                }

                            }


                            // I have the unique name array here - so what I need to do is select all windrawloss column for each name
                            // count each one for each unique name so I get an array of values for each name 
                            // I loop through that array and update each counter variables wins; draws; losses; 
                            // I send that back to the client with MP
                        }) 
              

                        // AT THIS STAGE I NEED TO CREATE AN OBJECT ARRAY WITH SOME ES6 possibly
                        // First I find the average of the avg_ratings 
                        // Then I create an object with name and overall_average for each player
                        // I store each one in an array and send it back to the client
                        // result.rows[i].name = uniqueNameArray[i];
                    }
                })
                
            }
            console.log('this is our unique name array:', uniqueNameArray);
            console.log('this is what we send back to the client:', overallRatingArray);
          }
        }
    })
    
})

// GENERATE WEEKLY SCORES BASED ON /:password

app.get('/api/weekly/:password', async (req, res) => {
    let password = req.params.password;
    console.log('THIS IS THE PASSWORD:', password);
    const text = `SELECT (name, avg_rating) FROM ratings WHERE password=$1`
    const values = [password]
    client.query(text, values, (err, result) => {
        if(err){
            console.log(err.stack);
        } else {
            console.log('this weeks rating', result);
            let str = result.rows[0].row;
            console.log('WHAT HEEE', str);
            let playerName = str.slice(
                str.indexOf('"') + 1,
                str.lastIndexOf('"'),
            )
            console.log(playerName);
            const query2 = `SELECT * FROM ratings WHERE name=$1 AND current_week=true`
            const values2 = [playerName];
            client.query(query2, values2, (err, result2) => {
                if(err){
                    console.log(err);
                } else {
                    console.log(result2);
                    console.log(result2.rows[0]);
                    let foundObject = result2.rows[0];
                    let c = 0;
                    for (let p = 5; p <= 19; p++) {
                        console.log('WHATS THIS', Object.values(foundObject)[p]);
                        c++;
                        if(Object.values(foundObject)[p] == null && Object.keys(foundObject)[p] !== 'avg_rating'){
                            console.log('Number of votes:', c - 1);
                            // let weeklyArray = result.rows;
                            // console.log(weeklyArray);
                            res.json({status: 'ok', result: result.rows, votes: c - 1});
                            break;
                        } else if (p == 19){
                            console.log('Number of votes: 14' );
                            // let weeklyArray = result.rows;
                            // console.log(weeklyArray);
                            res.json({status: 'ok', result: result.rows, votes: 14});
                        }
                        
                    }
                }
            })

            // res.json({status: 'ok', result: result})
        }
    })
})

// GENERATE INDIVIDUAL PLAYER RATINGS AND WHO GAVE THOSE RATINGS BASED ON PASSWORD 

// So first of all we will need to fetch the data for that week based on /:password 
// We then need the Rob Beadle whole Row - rating 1 to 14 and user 1 - 14  

app.get('/api/reveal/weekly/:name', async (req, res) => {
    let playerName = req.params.name;
    const text = `SELECT * FROM test_ratings WHERE name=$1 AND current_week=true`
    const values = [playerName]
    client.query(text, values, (err, result) => {
        if(err){
            console.log(err.stack);
        } else {
            console.log('PLAYER ROW', result.rows);
            // let str = result.rows[0].row;
            // console.log('WHAT HEEE', str);
            // let playerName = str.slice(
            //     str.indexOf('"') + 1,
            //     str.lastIndexOf('"'),
            // )
            // console.log(playerName);
            // const query2 = `SELECT * FROM ratings WHERE name=$1 AND current_week=true`
            // const values2 = [playerName];
            // client.query(query2, values2, (err, result2) => {
            //     if(err){
            //         console.log(err);
            //     } else {
            //         console.log(result2);
            //         console.log(result2.rows[0]);
            //         let foundObject = result2.rows[0];
            //         let c = 0;
            //         for (let p = 5; p <= 19; p++) {
            //             console.log('WHATS THIS', Object.values(foundObject)[p]);
            //             c++;
            //             if(Object.values(foundObject)[p] == null && Object.keys(foundObject)[p] !== 'avg_rating'){
            //                 console.log('Number of votes:', c - 1);
            //                 // let weeklyArray = result.rows;
            //                 // console.log(weeklyArray);
            //                 res.json({status: 'ok', result: result.rows, votes: c - 1});
            //                 break;
            //             } else if (p == 19){
            //                 console.log('Number of votes: 14' );
            //                 // let weeklyArray = result.rows;
            //                 // console.log(weeklyArray);
            //                 res.json({status: 'ok', result: result.rows, votes: 14});
            //             }
                        
            //         }
            //     }
            // })

            res.json({status: 'ok', result: result})
        }
    })
})



// GENERATE WEEKLY SCORES BASED ON CURRENT BOOLEAN 
app.get('/api/home/weekly', async (req, res) => {
    const query = `SELECT (name, avg_rating) FROM ratings WHERE current_week=true`
    client.query(query, (err, result) => {
        if(err)
        {
            console.log(err.stack);
        } else {
            let str = result.rows[0].row;
            console.log('WHAT HEEE', str);
            let playerName = str.slice(
                str.indexOf('"') + 1,
                str.lastIndexOf('"'),
            )
            console.log(playerName);
            const query2 = `SELECT * FROM ratings WHERE name=$1 AND current_week=true`
            const values2 = [playerName];
            client.query(query2, values2, (err, result2) => {
                if(err){
                    console.log(err);
                } else {
                    console.log(result2);
                    console.log(result2.rows[0]);
                    let foundObject = result2.rows[0];
                    let c = 0;
                    for (let p = 5; p <= 19; p++) {
                        console.log('WHATS THIS', Object.values(foundObject)[p]);
                        c++;
                        if(Object.values(foundObject)[p] == null && Object.keys(foundObject)[p] !== 'avg_rating'){
                            console.log('Number of votes:', c - 1);
                            let weeklyArray = result.rows;
                            console.log(weeklyArray);
                            res.json({status: 'ok', result: weeklyArray, votes: c - 1});
                            break;
                        } else if (p == 19){
                            console.log('Number of votes: 14' );
                            let weeklyArray = result.rows;
                            console.log(weeklyArray);
                            res.json({status: 'ok', result: weeklyArray, votes: 14});
                        }
                        
                    }
                }
            })

            // console.log('I\'m LOOKING FOR THIS', result);
            // let weeklyArray = result.rows;
            // console.log(weeklyArray);
            // res.json({status: 'ok', result: weeklyArray});
        }
    })
})


// ADMIN AUTHENTICATION - LOGIN SYSTEM 

app.post('/api/change-password', async (req, res) => {
    const { token, newpassword: plainTextPassword } = req.body

    // Invalid password error handling 
    if(!plainTextPassword || typeof plainTextPassword !== 'string'){
        return res.json({ status: 'error', error: 'Invalid password'})
    }

    if(plainTextPassword.length < 5){
        return res.json({status: 'error', error: 'Password too small. Should be at least 6 characters'})
    }
    try {
        const user = jwt.verify(token, JWT_SECRET)
        const _id = user.id
        const password = await bcrypt.hash(plainTextPassword, 10)
        await User.updateOne({_id}, { $set: { password }})
        res.json({ status: 'ok'})
    } catch (error) {
        res.json({ status: 'error', error: ';))'})
    }
})

app.post('/api/login', async (req,res) => {

    const { username, password} = req.body;

    const query = `SELECT (password) FROM admins WHERE username=$1`
    const values = [username];
    client.query(query, values, async (err, result) => {
        if(err)
        {
            console.log(err.stack);
            res.json({status: 'error', error: 'Invalid username/password'})
        } else {
            console.log('This is from the query', result);
            if(await bcrypt.compare(password, result.rows[0].password)){

                const token = jwt.sign({  
                    username: username 
                }, 
                JWT_SECRET)
        
                return res.json({status: 'ok',  data: token})
            }

        }
    })
})

app.post('/api/register', async (req, res) => {
    const {username, password: plainTextPassword } = req.body

    // Invalid Username error handling
    if(!username || typeof username !== 'string'){
        return res.json({ status: 'error', error: 'Invalid username'})
    }

    // Invalid password error handling 
    if(!plainTextPassword || typeof plainTextPassword !== 'string'){
        return res.json({ status: 'error', error: 'Invalid password'})
    }

    if(plainTextPassword.length < 5){
        return res.json({status: 'error', error: 'Password too small. Should be at least 6 characters'})
    }

    const password = await bcrypt.hash(plainTextPassword, 10)

    try {
        console.log('username: ', username);
        console.log('password: ', password)
        const query = `INSERT INTO admins(username, password) VALUES($1, $2) RETURNING *`
        const values = [username, password];
        client.query(query, values, (err, result) => {
            if(err)
            {
                console.log(err.stack);
            } else {
                console.log('postgresql REG BABY', result)
                res.json({status: 'ok', result: result});
            }
        })
    } catch (error) {
        if(error.code === 11000){
            return res.json({status: 'error', erorr: 'Username already exists'})
        }
        throw error
    }
    res.json({status: 'ok'})
})

// USER AUTHENTICATION - LOGIN SYSTEM 

app.post('/api/user-login', async (req,res) => {

    const { username, password} = req.body;

    const query = `SELECT (password) FROM users WHERE username=$1`
    const values = [username];
    client.query(query, values, async (err, result) => {
        if(err)
        {
            console.log(err.stack);
            res.json({status: 'error', error: 'Invalid username/password'})
        } else {
            console.log('This is from the query', result);
            if(await bcrypt.compare(password, result.rows[0].password)){

                const token = jwt.sign({  
                    username: username 
                }, 
                JWT_SECRET)
        
                return res.json({status: 'ok',  data: token})
            }

        }
    })
})

app.post('/api/user-register', async (req, res) => {
    const {email, username, password: plainTextPassword } = req.body

    // Invalid Username error handling
    if(!username || typeof username !== 'string'){
        return res.json({ status: 'error', error: 'Invalid username'})
    }

    // Invalid password error handling 
    if(!plainTextPassword || typeof plainTextPassword !== 'string'){
        return res.json({ status: 'error', error: 'Invalid password'})
    }

    if(plainTextPassword.length < 5){
        return res.json({status: 'error', error: 'Password too small. Should be at least 6 characters'})
    }

    const password = await bcrypt.hash(plainTextPassword, 10)

    try {
        console.log('username: ', username);
        console.log('email', email)
        console.log('password: ', password);
        const query = `INSERT INTO users(email, username, password) VALUES($1, $2, $3) RETURNING *`
        const values = [email, username, password];
        client.query(query, values, (err, result) => {
            if(err)
            {
                console.log(err.stack);
            } else {
                console.log('postgresql REG BABY', result)
                res.json({status: 'ok', result: result});
            }
        })
    } catch (error) {
        if(error.code === 11000){
            return res.json({status: 'error', error: 'Username already exists'})
        }
        throw error
    }
})


app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`)
})
