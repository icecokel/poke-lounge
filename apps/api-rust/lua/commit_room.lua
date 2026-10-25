-- All related keys share a hash tag. An expired lease can never authorize a stale write.
if redis.call('GET',KEYS[1])~=ARGV[1] then return {'fenced',''} end
if ARGV[5]~='' then
  local receipt=redis.call('GET',KEYS[5]);if receipt then return {'replayed',receipt} end
end
if redis.call('EXISTS',KEYS[2])==0 then return {'missing',''} end
local meta=redis.call('HMGET',KEYS[6],
  'roomInstanceId','roomCode','createdAtMs','hardExpiresAtMs',
  'storageVersion','revision','status','terminalAtMs')
local current
-- Older writers do not update metadata, so a version mismatch must check the document.
if not meta[1] or tonumber(meta[5])~=tonumber(ARGV[2]) then
  current=cjson.decode(redis.call('GET',KEYS[2]))
  if current.terminalAtMs==nil or current.terminalAtMs==cjson.null then current.terminalAtMs='' end
else
  current={roomInstanceId=meta[1],roomCode=meta[2],createdAtMs=tonumber(meta[3]),
    hardExpiresAtMs=tonumber(meta[4]),storageVersion=tonumber(meta[5]),revision=tonumber(meta[6]),
    status=meta[7],terminalAtMs=meta[8]~='' and tonumber(meta[8]) or ''}
end
local next={roomInstanceId=ARGV[8],roomCode=ARGV[9],createdAtMs=tonumber(ARGV[10]),
  hardExpiresAtMs=tonumber(ARGV[11]),storageVersion=tonumber(ARGV[12]),revision=tonumber(ARGV[13]),
  status=ARGV[14],terminalAtMs=ARGV[15]~='' and tonumber(ARGV[15]) or ''}
if current.roomInstanceId~=next.roomInstanceId or current.roomCode~=next.roomCode
  or current.createdAtMs~=next.createdAtMs or current.hardExpiresAtMs~=next.hardExpiresAtMs
  or current.storageVersion~=tonumber(ARGV[2]) or next.storageVersion~=current.storageVersion+1
  or next.revision<current.revision then return {'conflict',''} end
if (current.status=='closed' or current.status=='completed') and
  (next.status~=current.status or next.terminalAtMs~=current.terminalAtMs) then return {'closed',''} end
local t=redis.call('TIME');local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)
if next.status~='closed' and next.status~='completed' and now>=current.hardExpiresAtMs then return {'expired',''} end
redis.call('SET',KEYS[2],ARGV[3],'PXAT',ARGV[4])
redis.call('HSET',KEYS[6],
  'roomInstanceId',ARGV[8],'roomCode',ARGV[9],'createdAtMs',ARGV[10],'hardExpiresAtMs',ARGV[11],
  'storageVersion',ARGV[12],'revision',ARGV[13],'status',ARGV[14],'terminalAtMs',ARGV[15])
redis.call('PEXPIREAT',KEYS[6],ARGV[4])
if redis.call('GET',KEYS[3])==next.roomInstanceId then redis.call('PEXPIREAT',KEYS[3],ARGV[4]) end
if next.status=='closed' or next.status=='completed' then redis.call('ZREM',KEYS[4],next.roomInstanceId)
else redis.call('ZADD',KEYS[4],ARGV[7],next.roomInstanceId) end
if ARGV[5]~='' then redis.call('SET',KEYS[5],ARGV[5],'PXAT',ARGV[6]) end
return {'committed',ARGV[5]}
