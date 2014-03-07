module.exports.has_key = has_key;
module.exports.fmt_log = fmt_log;

function has_key(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
};

// With some effort, this could be made more friendly and useful. The main reason I use this is because
// it adds indentation to any lines from log_message that wrap around, which makes reading through the
// log file much easier. It also adds a time header, which is nice during development, as log messages
// don't have any time data (In production, Heroku adds time data to every log message).
//
// blank_before:
//      boolean that determines if we add a blank row before the log messgae
// blank_after:
//      boolean that determines if we add a blank row after the log messgae
// skip_time_header:
//      boolean that indiciates whether or not to skip printing a row with time data
//      if this is false, and blank_before is true, the blank row is added before the time header row
function fmt_log(log_message, blank_before, blank_after, skip_time_header) {
    if (typeof blank_before !== 'undefined' && blank_before) console.log('');

    // make sure we have a string. also allows users to pass non-string objects into fmt_log
    log_message = log_message.toString();

    // only use up until first space (to remove the GMT-xxxx and timezone label clutter)
    var now = new Date();
    var time_header = ' ' + now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();
    time_header += (' ' + (now.toTimeString()).split(' ')[0]);

    skip_time_header = !(typeof skip_time_header !== 'undefined' && skip_time_header == true);

    // spacing for non-header lines should be at most length 8
    var bullet = '';
    var spacing = Array(Math.min(6 + bullet.length, time_header.length) + 1).join(' ') + bullet;
    var max_message_len = 100 - (spacing.length);
    var message_list = [];

    var next_chunk, current_line, leading_spaces;
    var lines = log_message.split('\n');
    // handle new-lines sanely by running the while loop separately for each line
    for (var i = 0;  i < lines.length; i++) {
        current_line = lines[i];

        // do at least once (new-line splitting might create blank strings that we still want to print)
        do {
            next_chunk = current_line.slice(0, max_message_len);

            // if on the first line and the user has not specified to skip the time header
            if (message_list.length == 0 && skip_time_header)
                message_list.push(time_header);

            next_chunk = spacing + next_chunk;
            message_list.push(next_chunk);

            leading_spaces = /^[ ]*/.exec(current_line)[0];
            current_line = current_line.slice(max_message_len);

            // if current chunk wraps around, preserve the leading whitespace onto next line
            if (current_line.length !== 0) {
                current_line = leading_spaces + current_line;
            }
        } while (current_line.length !== 0)
    }

    for(var i = 0; i < message_list.length; i++)
        console.log(message_list[i]);

    if (typeof blank_after !== 'undefined' && blank_after) console.log('');
}

// hack to to call JSON.stringify on objects with circular references (for logging/debugging)
function custom_stringify(obj) {
    var cache = [];
    var stringified = JSON.stringify(obj, function(key, value) {
        if (typeof value === 'object' && value !== null) {
            if (cache.indexOf(value) !== -1) {
                // Circular reference found, discard key
                return;
            }
            // Store value in our collection
            cache.push(value);
        }
        return value;
    });
    cache = null; // Enable garbage collection
    return stringified;
};
