if redis.call('GET',KEYS[1])~=ARGV[1] then return {'fenced',''} end
local receipt=redis.call('GET',KEYS[5])
if receipt then return {'replayed',receipt} end
local t=redis.call('TIME')
local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)
local room=cjson.decode(ARGV[2])
if now>=room.lobbyEndsAtMs then return {'expired',''} end
redis.call('ZREMRANGEBYSCORE',KEYS[4],'-inf',now)
if redis.call('ZCARD',KEYS[4])>=tonumber(ARGV[5]) then return {'capacity',''} end
if redis.call('EXISTS',KEYS[2])==1 or redis.call('EXISTS',KEYS[3])==1 then return {'collision',''} end
redis.call('SET',KEYS[2],ARGV[2],'PXAT',ARGV[3])
redis.call('SET',KEYS[3],room.roomInstanceId,'PXAT',ARGV[3])
redis.call('ZADD',KEYS[4],room.lobbyEndsAtMs,room.roomInstanceId)
redis.call('SET',KEYS[5],ARGV[4],'PXAT',ARGV[3])
return {'created',ARGV[4]}
